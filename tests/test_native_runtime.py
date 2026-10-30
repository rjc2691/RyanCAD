import pytest
from ryancad.native_runtime import kernel_start_error
from ryancad import check_install, worker


MISSING_GL = "libGL.so.1: cannot open shared object file: No such file or directory"


def test_linux_missing_gl_names_the_system_packages_and_keeps_original_cause():
    error = kernel_start_error(ImportError(MISSING_GL), "linux")
    assert error.code == "kernel_start_failed"
    assert "apt-get install -y libgl1" in error.message
    assert "dnf install -y libglvnd-glx" in error.message
    assert "server" in error.message and "restart" in error.message
    assert error.details == {"missing_library": "libGL.so.1", "cause": MISSING_GL}


@pytest.mark.parametrize("platform,message", [
    ("win32", MISSING_GL), ("darwin", MISSING_GL),
    ("linux", "libGL.so.1: undefined symbol: example"),
    ("linux", "libGL.so.10: cannot open shared object file: No such file or directory"),
    ("linux", "No module named 'build123d'"),
])
def test_unrelated_loader_errors_are_not_misdiagnosed(platform, message):
    error = kernel_start_error(ImportError(message), platform)
    assert error.message == message
    assert error.details == {}


def test_worker_reports_dependency_diagnostic_before_ready_and_closes_connection(monkeypatch):
    from ryancad import geometry
    def missing():
        raise ImportError(MISSING_GL)
    monkeypatch.setattr(geometry, "Evaluator", missing)
    monkeypatch.setattr(worker, "kernel_start_error", lambda error: kernel_start_error(error, "linux"))
    class Connection:
        def __init__(self): self.sent, self.closed = [], False
        def send(self, message): self.sent.append(message)
        def close(self): self.closed = True
    connection = Connection()
    worker.worker_main(connection)
    assert connection.closed and len(connection.sent) == 1
    report = connection.sent[0]
    assert report["ok"] is False and report["error"]["code"] == "kernel_start_failed"
    assert report["error"]["details"]["missing_library"] == "libGL.so.1"
    assert "ready" not in report


def test_install_check_returns_failure_and_actionable_message(monkeypatch, capsys):
    def missing(): raise ImportError(MISSING_GL)
    monkeypatch.setattr(check_install, "check_native_runtime", missing)
    monkeypatch.setattr(check_install, "kernel_start_error", lambda error: kernel_start_error(error, "linux"))
    assert check_install.main() == 1
    output = capsys.readouterr()
    assert "libgl1" in output.err and output.out == ""


def test_install_check_exercises_real_native_geometry_and_solver(capsys):
    assert check_install.main() == 0
    assert "native geometry and sketch solver are ready" in capsys.readouterr().out
