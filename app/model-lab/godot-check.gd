# 23 Nov 2026: the game checker's helper (godot-check.mjs puts it in a throwaway copy of Bob's game as an autoload).
# It presses start, then every input the game knows, watches what moves, reads the screen's words and prints one line,
# BOBCHECK {...}, then quits. It never changes the game's own files (the copy is thrown away).
extends Node

var _t := 0.0
var _phase := 0
var _before := {}
var _seen_text := {}
var _max := {}
var _moved := 0.0
var _actions: Array = []
const KEYS := [KEY_LEFT, KEY_RIGHT, KEY_UP, KEY_DOWN, KEY_A, KEY_D, KEY_W, KEY_S, KEY_SPACE, KEY_J, KEY_K, KEY_L, KEY_U, KEY_I, KEY_Z, KEY_X, KEY_C, KEY_ENTER]

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	for a in InputMap.get_actions():
		var s: String = String(a)
		if not s.begins_with("ui_") or s in ["ui_left", "ui_right", "ui_up", "ui_down", "ui_accept"]:
			_actions.append(s)

func _walk(n: Node, f: Callable) -> void:
	f.call(n)
	for c in n.get_children():
		_walk(c, f)

func _bodies() -> Dictionary:
	var out := {}
	_walk(get_tree().root, func(n):
		if n == self: return
		if n is CharacterBody3D or n is CharacterBody2D or n is RigidBody3D or n is RigidBody2D or n is Camera2D or n is Camera3D:
			out[n.get_path()] = n.global_position)
	return out

func _read_screen() -> void:
	var counts := {}
	_walk(get_tree().root, func(n):
		if n == self: return
		var k: String = n.get_class()
		counts[k] = int(counts.get(k, 0)) + 1
		if n is Label or n is RichTextLabel or n is Button:
			var t: String = String(n.text).strip_edges()
			if t != "" and _seen_text.size() < 200: _seen_text[t.substr(0, 120)] = true
		if n is Label3D:
			var t3: String = String(n.text).strip_edges()
			if t3 != "" and _seen_text.size() < 200: _seen_text[t3.substr(0, 120)] = true)
	for k in counts:
		_max[k] = max(int(_max.get(k, 0)), int(counts[k]))

func _key(code: int, down: bool) -> void:
	var e := InputEventKey.new()
	e.keycode = code
	e.physical_keycode = code
	e.pressed = down
	Input.parse_input_event(e)

func _press_all(down: bool) -> void:
	for a in _actions:
		if down: Input.action_press(a)
		else: Input.action_release(a)

func _measure() -> void:
	var now: Dictionary = _bodies()
	for p in now:
		if _before.has(p):
			_moved = max(_moved, (now[p] - _before[p]).length())
	_before = now

func _process(delta: float) -> void:
	_t += delta
	if int(_t * 10) % 5 == 0: _read_screen()
	if _phase == 0 and _t > 1.0:
		_phase = 1
		_read_screen()
		for k in [KEY_ENTER, KEY_SPACE]: _key(k, true)
		Input.action_press("ui_accept")
	elif _phase == 1 and _t > 1.3:
		_phase = 2
		for k in [KEY_ENTER, KEY_SPACE]: _key(k, false)
		Input.action_release("ui_accept")
	elif _phase == 2 and _t > 2.5:
		_phase = 3
		_before = _bodies()
		for k in [KEY_RIGHT, KEY_D]: _key(k, true)
		Input.action_press("ui_right")
		for a in _actions:
			if "right" in a or "forward" in a: Input.action_press(a)
	elif _phase == 3 and _t > 4.0:
		_phase = 4
		_measure()
		for k in [KEY_RIGHT, KEY_D]: _key(k, false)
		for a in _actions: Input.action_release(a)
		Input.action_release("ui_right")
		_before = _bodies()
		for k in KEYS: _key(k, true)
		_press_all(true)
	elif _phase == 4 and _t > 5.5:
		_phase = 5
		_measure()
		for k in KEYS: _key(k, false)
		_press_all(false)
	elif _phase == 5 and _t > 7.0:
		_phase = 6
		_read_screen()
		var main: String = String(ProjectSettings.get_setting("application/run/main_scene", ""))
		var cur: Node = get_tree().current_scene
		var out: Dictionary = {
			"main_scene": main,
			"current_scene": cur.scene_file_path if cur else "",
			"nodes": _max,
			"text": _seen_text.keys(),
			"moved": snappedf(_moved, 0.01),
			"actions": _actions,
			"paused": get_tree().paused,
		}
		print("BOBCHECK " + JSON.stringify(out))
		get_tree().quit()
