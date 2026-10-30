"""A persistent spawn-safe kernel process with hard cancellation and restart."""
from __future__ import annotations

import multiprocessing as mp
import threading
import time
import traceback

from .errors import CadError
from .native_runtime import kernel_start_error


def worker_main(connection):
    try:
        from .geometry import Evaluator
        evaluator = Evaluator()
        connection.send({"ready": True})
        while True:
            request = connection.recv()
            if request["operation"] == "shutdown":
                return
            try:
                operation, arguments = request["operation"], request["arguments"]
                result = getattr(evaluator, operation)(**arguments)
                connection.send({"ok": True, "result": result})
            except CadError as exc:
                connection.send({"ok": False, "error": exc.payload()})
            except Exception as exc:
                connection.send({"ok": False, "error": {"code": "kernel_error", "message": str(exc), "details": {"trace": traceback.format_exc()[-2500:]}}})
    except (EOFError, BrokenPipeError):
        return
    except Exception as exc:
        try:
            connection.send({"ok": False, "error": kernel_start_error(exc).payload()})
        except Exception:
            pass
    finally:
        connection.close()


class GeometryWorker:
    def __init__(self):
        self.context = mp.get_context("spawn")
        self.process = self.connection = None
        self.lock = threading.Lock()
        self.generation = 0
        self.process_generation = -1
        self.ready = False
        self.status = "idle"
        self.owner_thread = None

    def _receive(self, generation, timeout):
        started = time.monotonic()
        while time.monotonic() - started < timeout:
            if generation != self.generation:
                raise CadError("cancelled", "The geometry job was cancelled. The last saved revision remains available.")
            if self.connection.poll(.05):
                try:
                    return self.connection.recv()
                except (EOFError, OSError) as exc:
                    raise CadError("worker_stopped", "The geometry worker stopped. Retry to restart it safely.") from exc
            if not self.process.is_alive():
                raise CadError("worker_stopped", "The geometry worker stopped. Retry to restart it safely.", exit_code=self.process.exitcode)
        self.cancel()
        raise CadError("geometry_timeout", "The geometry job exceeded its time limit and was stopped.")

    def _start(self, generation):
        if self.process and self.process.is_alive() and self.ready and self.process_generation == generation:
            return
        if self.process and self.process.is_alive():
            self.process.terminate()
            self.process.join(timeout=1)
        if self.connection:
            self.connection.close()
        self.connection, child = self.context.Pipe()
        self.process = self.context.Process(target=worker_main, args=(child,), name="RyanCAD Geometry", daemon=True)
        self.ready = False
        self.process_generation = generation
        self.process.start()
        child.close()
        self.status = "starting"
        if generation != self.generation:
            self.process.terminate()
            self.process.join(timeout=1)
            raise CadError("cancelled", "Native worker startup was cancelled.")
        ready = self._receive(generation, 120)
        if not ready.get("ready"):
            error = ready.get("error", {})
            raise CadError(error.get("code", "kernel_start_failed"), error.get("message", "Cannot start the native CAD kernel."), **error.get("details", {}))
        self.ready = True

    def call(self, operation, timeout=300, **arguments):
        with self.lock:
            generation = self.generation
            self.owner_thread = threading.get_ident()
            try:
                self._start(generation)
                if generation != self.generation:
                    raise CadError("cancelled", "The operation was cancelled before dispatch.")
                self.status = "working"
                self.connection.send({"operation": operation, "arguments": arguments})
                response = self._receive(generation, timeout)
                if not response.get("ok"):
                    error = response.get("error", {"code": "worker_protocol_error", "message": "The worker returned an unexpected response. Retry to restart it.", "details": {}})
                    raise CadError(error["code"], error["message"], **error.get("details", {}))
                return response["result"]
            except (EOFError, BrokenPipeError, OSError) as exc:
                raise CadError("worker_stopped", "The geometry worker disconnected. Your saved design is intact; retry the operation.") from exc
            finally:
                self.status = "idle"
                self.owner_thread = None

    def cancel(self):
        self.generation += 1
        self.ready = False
        process = self.process
        if process and process.is_alive():
            process.terminate()
            process.join(timeout=.5)
        self.status = "cancelled"

    def close(self):
        self.cancel()
        if self.connection:
            self.connection.close()
