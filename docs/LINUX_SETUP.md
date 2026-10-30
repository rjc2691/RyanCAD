# Linux and EC2 native runtime

The web server starts independently of the geometry worker. A missing native library can therefore leave the interface working while importing a reference design or making a part fails at the first kernel operation.

## `libGL.so.1` missing

This is a missing **server operating-system library**, not a browser WebGL error. RyanCAD imports build123d/OpenCascade in its geometry worker. Those native binaries can link to the OpenGL client runtime even when all rendering happens in the browser. Installing the Python dependencies alone does not install this OS package.

Check the distribution with `cat /etc/os-release`, then use the matching commands **on the EC2 instance**:

Ubuntu / Debian:

```bash
sudo apt-get update
sudo apt-get install -y libgl1
```

Amazon Linux 2023:

```bash
sudo dnf install -y libglvnd-glx
```

Ubuntu's [libgl1 file list](https://packages.ubuntu.com/jammy/amd64/libgl1/filelist) includes `libGL.so.1`. AWS lists [libglvnd-glx in Amazon Linux 2023](https://docs.aws.amazon.com/linux/al2023/release-notes/all-packages-AL2023.12.html); the upstream Fedora [package provides libGL.so.1](https://packages.fedoraproject.org/pkgs/libglvnd/libglvnd-glx/fedora-45.html).

If using a container, install the package **in its image**, then rebuild/redeploy the container. Installing it only on the host does not update a container's filesystem. For a Debian/Ubuntu-based image, add the same apt commands to its build steps.

Restart the RyanCAD service/process after installation and retry the reference import. If the existing systemd unit is named `ryancad`, use:

```bash
sudo systemctl restart ryancad
```

A browser refresh does not install or reload native libraries. This library-loading failure occurs before an edit is committed; existing saved designs remain intact. No GPU instance, desktop session or X server is needed for these import/geometry checks.

## Verify the Python environment used by the server

From the project directory, using the server's virtual environment:

```bash
.venv/bin/python -m ryancad.check_install
```

This command creates an in-memory unit box and solves a sketch dimension. It does not start an HTTP listener or open/change any design. A successful run prints `RyanCAD native geometry and sketch solver are ready.` It returns a nonzero exit code with the dependency diagnostic on failure. Bootstrap runs this check before reporting setup complete.

For older installations that do not yet contain this diagnostic module, check the kernel import directly:

```bash
.venv/bin/python -c 'from build123d import Box; print(Box(1, 1, 1).volume)'
```

Use the actual service interpreter if it is installed somewhere other than `.venv`. A result approximately equal to `1` confirms native box construction. If a different shared library is reported next, preserve that exact error and resolve its OS package rather than changing Python geometry versions at random.

## Supported environment and coverage

Use Python 3.12/3.13 and the locked dependencies. Current Linux OCP wheels in `uv.lock` require glibc 2.28 or newer; Ubuntu 22.04+ or Amazon Linux 2023 are suitable base systems. Amazon Linux 2's older glibc is not a suitable target for this locked wheel set. An OpenGL runtime package does not fix a glibc-version or CPU-architecture mismatch.

Linux has been added to the CI matrix with `libgl1` and a native smoke test, alongside the existing Windows/macOS checks. Adding the job is not evidence that a particular EC2 image has been tested. For source builds, run `python scripts/bootstrap.py` after installing the OS dependencies. Prebuilt RyanCAD wheels contain the frontend and do not require Node.js at runtime.
