# stand-in for the editor's unreal module (only what Bob's scripts use)
class Vector:
    def __init__(s,x=0,y=0,z=0): s.x,s.y,s.z=x,y,z
    def __add__(s,o): return Vector(s.x+o.x,s.y+o.y,s.z+o.z)
class Rotator:
    def __init__(s,roll=0,pitch=0,yaw=0): s.roll,s.pitch,s.yaw=roll,pitch,yaw
class _Cls:
    def __init__(s,n): s.n=n
    def get_name(s): return s.n
class Asset:
    def __init__(s,p): s.p=p
    def get_path_name(s): return s.p+'.'+s.p.split('/')[-1]
class StaticMeshComponent:
    def __init__(s,mesh): s.static_mesh=mesh; s.mats=[None]
    def get_materials(s): return s.mats
    def set_material(s,i,m): s.mats[i]=m
class Actor:
    def __init__(s,label,cls,loc,rot,mesh=None): s.label,s.cls,s.loc,s.rot,s.sc=label,cls,loc,rot,Vector(1,1,1); s.comp=StaticMeshComponent(mesh) if mesh else None
    def get_actor_label(s): return s.label
    def set_actor_label(s,l): s.label=l
    def get_class(s): return _Cls(s.cls)
    def get_actor_location(s): return s.loc
    def set_actor_location(s,v,a,b): s.loc=v
    def get_actor_rotation(s): return s.rot
    def set_actor_rotation(s,r,a): s.rot=r
    def get_actor_scale3d(s): return s.sc
    def set_actor_scale3d(s,v): s.sc=v
    def get_component_by_class(s,c): return s.comp
LEVEL=[Actor('Floor','StaticMeshActor',Vector(0,0,0),Rotator(),Asset('/Engine/BasicShapes/Plane'))]
class EditorActorSubsystem:
    def get_all_level_actors(s): return list(LEVEL)
    def get_selected_level_actors(s): return LEVEL[:1]
    def spawn_actor_from_object(s,o,loc,rot): a=Actor(o.p.split('/')[-1],'StaticMeshActor',loc,rot,o); LEVEL.append(a); return a
    def spawn_actor_from_class(s,c,loc,rot): a=Actor(c.__name__,c.__name__,loc,rot); LEVEL.append(a); return a
    def destroy_actor(s,a): LEVEL.remove(a)
class World:
    def get_name(s): return 'Main'
class UnrealEditorSubsystem:
    def get_editor_world(s): return World()
class LevelEditorSubsystem:
    saved=0
    def save_current_level(s): LevelEditorSubsystem.saved+=1
def get_editor_subsystem(c): return c()
class EditorAssetLibrary:
    @staticmethod
    def load_asset(p): return Asset(p) if p.startswith('/Engine/') or p in ('/Game/M_Red',) else None
class PointLight: pass
class SpotLight: pass
class DirectionalLight: pass
class RectLight: pass
class CameraActor: pass
class PlayerStart: pass
class ScopedEditorTransaction:
    def __init__(s,t): pass
    def __enter__(s): return s
    def __exit__(s,*a): return False
class AssetImportTask:
    def __init__(s): s.p={}
    def set_editor_property(s,k,v): s.p[k]=v
    def get_editor_property(s,k): return ['/Game/Bob/'+s.p['filename'].split('/')[-1].split('.')[0]] if k=='imported_object_paths' else s.p.get(k)
class _Tools:
    def import_asset_tasks(s,t): pass
class AssetToolsHelpers:
    @staticmethod
    def get_asset_tools(): return _Tools()
