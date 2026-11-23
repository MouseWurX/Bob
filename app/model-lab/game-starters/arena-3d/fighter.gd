extends CharacterBody3D
# A fighter that walks left and right along the arena and jumps. Godot 4: CharacterBody3D, velocity, move_and_slide().

@export var player_controlled := true
const SPEED := 4.0
const JUMP_VELOCITY := 5.5

var gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity")

func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= gravity * delta
	if player_controlled:
		if Input.is_action_just_pressed("jump") and is_on_floor():
			velocity.y = JUMP_VELOCITY
		velocity.x = Input.get_axis("move_left", "move_right") * SPEED
	move_and_slide()
