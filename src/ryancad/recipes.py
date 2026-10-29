"""Native, editable reference designs built through the public document operations."""
from __future__ import annotations

from .commands import create_component, create_feature, create_instance, parameter
from .errors import CadError
from .model import Document, Fit, uid


def build_recipe(document, actor, recipe):
    if recipe not in {"mold", "plate", "blank"}:
        raise CadError("unknown_recipe", "Choose mold, plate or blank.")
    blank = Document(id=document.id, name={"mold": "Silicone mold · printed tooling", "plate": "Mounting plate · fit study", "blank": "Untitled design"}[recipe])
    for field in ("name", "parameters", "components", "instances", "features", "feature_order", "fits", "notes"):
        setattr(document, field, getattr(blank, field))
    if recipe == "blank":
        return {}, [], "Create an empty design"

    def root(name, value, category="Design inputs"):
        return parameter(document, actor, "root", name, value, category=category, named=True)

    def ref(identifier):
        return {"parameter": identifier}

    def feature(owner, kind, name, values, **options):
        return create_feature(document, actor, owner, kind, values, options, name=name)

    def fit(name, pin, socket):
        obj = Fit(id=uid("fit"), name=name, pin_parameter=pin, socket_parameter=socket)
        document.fits[obj.id] = obj

    if recipe == "plate":
        length = root("Plate length", 80)
        width = root("Plate width", 40)
        thickness = root("Plate thickness", 6)
        offset = root("Hole edge offset", 8)
        hole = root("Mounting hole diameter", 5)
        radius = root("Standard edge fillet", 3, "Shared standards")
        pin_d = root("Alignment pin diameter", 6, "Fit")
        clearance = root("Diametral clearance", .3, "Fit")
        socket = root("Alignment socket diameter", f"{pin_d} + {clearance}", "Fit")
        plate, plate_instance = create_component(document, actor, "Mounting plate", color="#689ac5")
        feature(plate.id, "box", "Plate stock", {"length": ref(length), "width": ref(width), "height": ref(thickness)})
        feature(plate.id, "fillet", "Standard outer corners", {"radius": ref(radius)}, selector={"group": "vertical"})
        feature(plate.id, "holes", "Four mounting holes", {"diameter": ref(hole), "x": f"-{length}/2 + {offset}", "y": f"-{width}/2 + {offset}",
            "count_x": 2, "count_y": 2, "spacing_x": f"{length} - 2*{offset}", "spacing_y": f"{width} - 2*{offset}"})
        feature(plate.id, "holes", "Alignment sockets", {"diameter": ref(socket), "x": f"-{length}/4", "count_x": 2, "spacing_x": f"{length}/2"})
        pin, pin_instance = create_component(document, actor, "Alignment pin", color="#c5aa68", placement={"x": f"-{length}/4"})
        feature(pin.id, "cylinder", "Pin shoulder", {"diameter": 10, "height": 2, "z": -2})
        feature(pin.id, "cylinder", "Pin shank", {"diameter": ref(pin_d), "height": 12})
        create_instance(document, actor, pin.id, "Alignment pin · second", placement={"x": f"{length}/4"})
        fit("Pin / plate socket", pin_d, socket)
        document.notes = "Editable reference plate. Four mounting holes preserve their edge offsets. Two linked pins share one definition. Clearance is diametral and requires printer calibration."
    else:
        casting_d = root("Concrete casting diameter", 44)
        casting_h = root("Concrete casting height", 30)
        silicone_wall = root("Silicone wall allowance", 8)
        silicone_cap = root("Silicone top allowance", 10)
        tooling_wall = root("Printed form wall", 10)
        base_thickness = root("Tooling base thickness", 6)
        clearance = root("Diametral fit clearance", .3, "Fit")
        gap = root("Parting gap", .25, "Fit")
        pin_d = root("Alignment pin diameter", 5, "Fit")
        socket_d = root("Alignment socket diameter", f"{pin_d} + {clearance}", "Fit")
        cavity_d = root("Silicone outer diameter", f"{casting_d} + 2*{silicone_wall}", "Derived envelope")
        form_length = root("Form outer length", f"{cavity_d} + 2*{tooling_wall}", "Derived envelope")
        form_height = root("Form height", f"{casting_h} + {silicone_cap}", "Derived envelope")
        peg_d = root("Master locating peg diameter", 8, "Fit")
        peg_socket = root("Master socket diameter", f"{peg_d} + {clearance}", "Fit")

        base, _ = create_component(document, actor, "Tooling base", color="#657487")
        feature(base.id, "box", "Base plate", {"length": f"{form_length}+10 mm", "width": f"{form_length}+10 mm", "height": ref(base_thickness)})
        for side in (-1, 1):
            for end in (-1, 1):
                feature(base.id, "cylinder", f"Alignment post {side:+d}/{end:+d}", {"diameter": ref(pin_d), "height": 4,
                    "x": f"{side}*({form_length}/2-7 mm)", "y": f"{end}*({form_length}/2-7 mm)", "z": ref(base_thickness)})
        feature(base.id, "cylinder", "Master locating socket", {"diameter": ref(peg_socket), "height": 3.1, "z": f"{base_thickness}-3 mm"}, operation="cut")
        for side, label, color in [(-1, "Left removable form", "#689ac5"), (1, "Right removable form", "#70a997")]:
            part, _ = create_component(document, actor, label, color=color)
            feature(part.id, "box", "Form half stock", {"length": f"{form_length}/2", "width": ref(form_length), "height": ref(form_height),
                "x": f"{side}*({form_length}/4+{gap}/2)", "z": ref(base_thickness)})
            feature(part.id, "cylinder", "Silicone outer cavity", {"diameter": ref(cavity_d), "height": f"{form_height}+2 mm",
                "z": f"{base_thickness}-1 mm"}, operation="cut")
            feature(part.id, "holes", "Base alignment sockets", {"diameter": ref(socket_d), "x": f"{side}*({form_length}/2-7 mm)",
                "y": f"-({form_length}/2-7 mm)", "count_y": 2, "spacing_y": f"{form_length}-14 mm"})
        master, _ = create_component(document, actor, "Removable casting master", color="#c5aa68")
        feature(master.id, "cylinder", "Master locating peg", {"diameter": ref(peg_d), "height": 3, "z": f"{base_thickness}-3 mm"})
        feature(master.id, "cylinder", "Concrete shape master", {"diameter": ref(casting_d), "height": ref(casting_h), "z": ref(base_thickness)})
        fit("Form / base alignment", pin_d, socket_d)
        fit("Master / locating socket", peg_d, peg_socket)
        document.notes = "Printed tooling for a silicone mold, which subsequently casts a small concrete object. Left/right forms and master are independently removable components. Silicone allowances and clearances are editable design inputs, not process recommendations. Physical fit, sealing, release and shrinkage require calibration."
    affected = list(document.components) + list(document.features)
    return {"component_ids": [c for c in document.components if c != "root"], "parameter_count": len(document.parameters)}, affected, f"Load native {'mold-making tooling' if recipe == 'mold' else 'plate and linked pins'} reference"
