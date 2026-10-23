# Editable reference designs

These examples are generated from the same semantic modeling operations as the application. Each portable native snapshot includes editable intent and its durable journal. The STL folders contain one file per manufactured instance and an export receipt.

- **mold-tooling.rycad.zip:** printed base, removable left/right forms, and casting master for a silicone-mold workflow.
- **plate-and-pins.rycad.zip:** a parameterized plate with edge-offset mounting holes, a shared corner fillet, and two linked pins.

Use Project → Open a native design copy to import the current editable model. To restore its complete journal/checkpoint history into a new project folder, use:

```text
python -m ryancad --restore examples/mold-tooling.rycad.zip --project runtime/projects/restored-mold.rycad
```

Regenerate these fixtures with the project environment:

```text
python scripts/generate_examples.py
```

Example clearances and silicone allowances are test inputs. Physical fit, sealing, release, process shrinkage and fabrication suitability require calibration. No structural or demolding simulation is claimed.

The user-supplied STL files remain in the separate `stls/` folder.
