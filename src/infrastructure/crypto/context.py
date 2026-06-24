class UserRawKey:
    """Holds the per-request raw AES key supplied by the client via X-User-Key header."""

    def __init__(self, value: bytes | None = None) -> None:
        self.value = value
