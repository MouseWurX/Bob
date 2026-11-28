// Checks PhoneDocs.kt (Bob's documents on the phone) and WebLook on a PC, without Android:
//   kotlinc -cp json.jar android/app/src/main/java/ca/mousewurx/bob/PhoneDocs.kt android/tools/PhoneDocsCheck.kt -include-runtime -d pd.jar
//   java -cp pd.jar:json.jar PhoneDocsCheckKt        (json.jar = org.json, from Maven Central)
import ca.mousewurx.bob.PhoneDocs
import ca.mousewurx.bob.WebLook
import java.io.File
fun check(n: String, ok: Boolean) { println((if (ok) "PASS " else "FAIL ") + n); if (!ok) System.exit(1) }
fun main() {
    val root = File(System.getProperty("java.io.tmpdir"), "pd" + System.nanoTime())
    val d = PhoneDocs(root)
    check("empty list", d.list().length() == 0)
    d.write("Budget.xlsx", byteArrayOf(1, 2, 3))
    check("write + read", d.read("Budget.xlsx")!!.toList() == listOf<Byte>(1, 2, 3))
    for (i in 4..10) d.write("Budget.xlsx", byteArrayOf(i.toByte()))
    val l = d.list().getJSONObject(0)
    check("keeps 5 old versions", l.getInt("versions") == 5 && l.getString("name") == "Budget.xlsx")
    check("undo puts back the one before", d.undo("Budget.xlsx") && d.read("Budget.xlsx")!![0] == 9.toByte())
    check("undo again steps further back", d.undo("Budget.xlsx") && d.read("Budget.xlsx")!![0] == 8.toByte())
    check("free name", d.freeName("Budget.xlsx") == "Budget (2).xlsx" && d.freeName("New.docx") == "New.docx")
    for (bad in listOf("../x.xlsx", "a/b.docx", ".hidden.txt", "x.exe", "", "a\u0000.txt", "C:\\x.docx")) check("refused: $bad", runCatching { d.write(bad, byteArrayOf(1)) }.isFailure)
    check("delete then undo brings it back", d.delete("Budget.xlsx") && d.read("Budget.xlsx") == null && d.undo("Budget.xlsx") && d.read("Budget.xlsx") != null)
    check(".old and .part never listed", (0 until d.list().length()).all { !d.list().getJSONObject(it).getString("name").startsWith(".") })
    for (u in listOf("https://en.wikipedia.org/wiki/Tea", "https://html.duckduckgo.com/html/?q=x")) check("allowed: $u", WebLook.allowed(u))
    for (u in listOf("http://example.com", "https://localhost/", "https://my-pc.tail1.ts.net/", "https://u:p" + "@example.com/", "file:///etc/passwd", "https://printer.local/", "nonsense"))
        check("refused: $u", !WebLook.allowed(u))
    check("private address refused at fetch", WebLook.get("https://127.0.0.1/").getInt("status") == 0 && WebLook.get("https://" + listOf("10", "0", "0", "1").joinToString(".") + "/").getInt("status") == 0 && WebLook.get("https://100.100.1.1/").getInt("status") == 0)
    root.deleteRecursively()
}
