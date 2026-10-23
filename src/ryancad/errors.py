from __future__ import annotations


class CadError(Exception):
    """An expected, actionable modeling failure safe to send to clients."""

    def __init__(self, code: str, message: str, **details):
        super().__init__(message)
        self.code, self.message, self.details = code, message, details

    def payload(self):
        return {"code": self.code, "message": self.message, "details": self.details}
