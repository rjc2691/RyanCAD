"""Read-only native dependency smoke test: python -m ryancad.check_install."""
from __future__ import annotations

import math
import sys
from .native_runtime import kernel_start_error


def check_native_runtime():
    from .geometry import Evaluator
    Evaluator()
    from build123d import Box
    import planegcs

    if not math.isclose(Box(1, 1, 1).volume, 1, abs_tol=1e-8):
        raise RuntimeError("The native CAD kernel returned an invalid test volume.")
    sketch = planegcs.Sketch()
    origin, point = sketch.add_fixed_point(0, 0), sketch.add_point(3, 4)
    sketch.set_p2p_distance(origin, point, 10)
    if sketch.solve() != planegcs.SolveStatus.Success or not math.isclose(math.hypot(*sketch.get_point(point)), 10, abs_tol=1e-6):
        raise RuntimeError("The native sketch solver failed its test dimension.")


def main():
    try:
        check_native_runtime()
    except Exception as error:
        print(kernel_start_error(error).message, file=sys.stderr)
        return 1
    print("RyanCAD native geometry and sketch solver are ready.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
