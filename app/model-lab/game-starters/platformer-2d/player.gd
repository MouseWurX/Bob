extends CharacterBody2D
# The player: runs, falls and jumps. Godot 4: velocity is a property and move_and_slide() takes no arguments.

const SPEED := 260.0
const JUMP_VELOCITY := -520.0

var gravity: float = ProjectSettings.get_setting("physics/2d/default_gravity")

func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity.y += gravity * delta
	if Input.is_action_just_pressed("jump") and is_on_floor():
		velocity.y = JUMP_VELOCITY
	velocity.x = Input.get_axis("move_left", "move_right") * SPEED
	move_and_slide()
