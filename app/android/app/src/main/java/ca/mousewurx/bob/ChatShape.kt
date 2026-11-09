package ca.mousewurx.bob

import org.json.JSONArray
import org.json.JSONObject

// Turns a chat into the shape the model's own template expects (OpenAI style), whoever sent it:
// the phone page, or another Bob borrowing this phone's brain (Lend protocol v1).
object ChatShape {
    private const val MAX_TEXT = 60_000

    /**
     * Messages in: {role, content, tool_calls?: [{function: {name, arguments: {...}}}], tool_name?}.
     * Out: one system message first (if any), later system notes folded into the user turn next to them
     * (most templates refuse a system message anywhere but the start), tool calls with ids and their
     * arguments as JSON text, and each tool result tied to its call.
     */
    fun toModel(messages: JSONArray): JSONArray {
        val out = JSONArray()
        val firstSystem = StringBuilder()
        var i = 0
        while (i < messages.length() && messages.optJSONObject(i)?.optString("role") == "system") {
            if (firstSystem.isNotEmpty()) firstSystem.append("\n\n")
            firstSystem.append(messages.getJSONObject(i).optString("content").take(MAX_TEXT)); i++
        }
        if (firstSystem.isNotEmpty()) out.put(JSONObject().put("role", "system").put("content", firstSystem.toString()))

        var notes = StringBuilder() // system notes waiting for the next user turn
        var callIds = ArrayList<Pair<String, String>>() // (id, name) of the last assistant's calls, in order
        var nextTool = 0
        var turn = 0
        fun last(): JSONObject? = if (out.length() > 0) out.getJSONObject(out.length() - 1) else null

        while (i < messages.length()) {
            val m = messages.optJSONObject(i++) ?: continue
            val content = if (m.opt("content") is String) m.getString("content").take(MAX_TEXT) else ""
            when (m.optString("role")) {
                "system" -> { if (content.isNotBlank()) { if (notes.isNotEmpty()) notes.append("\n\n"); notes.append(content) } }
                "user" -> {
                    val text = if (notes.isNotEmpty()) "($notes)\n\n$content" else content
                    notes = StringBuilder()
                    val prev = last()
                    if (prev?.optString("role") == "user") prev.put("content", prev.getString("content") + "\n\n" + text)
                    else out.put(JSONObject().put("role", "user").put("content", text))
                }
                "assistant" -> {
                    flushNotes(out, notes); notes = StringBuilder()
                    val o = JSONObject().put("role", "assistant").put("content", content)
                    val calls = m.optJSONArray("tool_calls")
                    callIds = ArrayList(); nextTool = 0; turn++
                    if (calls != null && calls.length() > 0) {
                        val arr = JSONArray()
                        for (j in 0 until minOf(calls.length(), 16)) {
                            val f = calls.optJSONObject(j)?.optJSONObject("function") ?: continue
                            val name = f.optString("name").take(80)
                            if (name.isEmpty()) continue
                            val args = when (val a = f.opt("arguments")) {
                                is JSONObject -> a.toString()
                                is String -> if (runCatching { JSONObject(a) }.isSuccess) a else "{}"
                                else -> "{}"
                            }
                            val id = "call_${turn}_$j"
                            callIds.add(id to name)
                            arr.put(JSONObject().put("id", id).put("type", "function").put("function", JSONObject().put("name", name).put("arguments", args)))
                        }
                        if (arr.length() > 0) o.put("tool_calls", arr)
                    }
                    out.put(o)
                }
                "tool" -> {
                    val name = m.optString("tool_name").ifEmpty { m.optString("name") }.take(80)
                    val o = JSONObject().put("role", "tool").put("content", content)
                    // The n-th result after a reply with calls belongs to its n-th call (or the call with that name).
                    var k = -1
                    if (nextTool < callIds.size && (name.isEmpty() || callIds[nextTool].second == name)) k = nextTool
                    else for (x in nextTool until callIds.size) if (callIds[x].second == name) { k = x; break }
                    if (k >= 0) { o.put("tool_call_id", callIds[k].first).put("name", callIds[k].second); nextTool = k + 1 }
                    else if (name.isNotEmpty()) o.put("name", name)
                    out.put(o)
                }
            }
        }
        flushNotes(out, notes)
        return out
    }

    // Notes with no user turn after them: their own user turn at the end.
    private fun flushNotes(out: JSONArray, notes: StringBuilder) {
        if (notes.isEmpty()) return
        val prev = if (out.length() > 0) out.getJSONObject(out.length() - 1) else null
        if (prev?.optString("role") == "user") prev.put("content", prev.getString("content") + "\n\n(" + notes + ")")
        else out.put(JSONObject().put("role", "user").put("content", "($notes)"))
    }

    /** Only function tools with sensible names travel on. */
    fun tools(tools: JSONArray?): JSONArray {
        val out = JSONArray()
        if (tools == null) return out
        for (j in 0 until minOf(tools.length(), 128)) {
            val t = tools.optJSONObject(j) ?: continue
            val name = t.optJSONObject("function")?.optString("name") ?: continue
            if (t.optString("type") == "function" && Regex("""^[\w.-]{1,80}$""").matches(name)) out.put(t)
        }
        return out
    }

    /** The model's tool calls, back in the shape the other Bob reads: [{function: {name, arguments: {...}}}]. */
    fun callsOut(calls: JSONArray): JSONArray {
        val out = JSONArray()
        for (j in 0 until calls.length()) {
            val c = calls.optJSONObject(j) ?: continue
            val name = c.optString("name")
            if (name.isEmpty()) continue
            val args = runCatching { JSONObject(c.optString("arguments").ifEmpty { "{}" }) }.getOrElse { JSONObject() }
            out.put(JSONObject().put("function", JSONObject().put("name", name).put("arguments", args)))
        }
        return out
    }

    /** Drops the oldest turns after the system message (keeping the last user turn and what follows it). */
    fun trimOldest(messages: JSONArray): JSONArray? {
        val start = if (messages.optJSONObject(0)?.optString("role") == "system") 1 else 0
        var lastUser = -1
        for (j in 0 until messages.length()) if (messages.getJSONObject(j).optString("role") == "user") lastUser = j
        if (lastUser <= start) return null
        // Drop the first turn: everything up to (not including) the next user message after it.
        var cut = start + 1
        while (cut < lastUser && messages.getJSONObject(cut).optString("role") != "user") cut++
        val out = JSONArray()
        for (j in 0 until messages.length()) if (j < start || j >= cut) out.put(messages.get(j))
        return out
    }
}
