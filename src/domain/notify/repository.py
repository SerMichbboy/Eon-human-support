from abc import ABC, abstractmethod


class IEmailSuppressionRepository(ABC):
    @abstractmethod
    async def is_suppressed(self, email: str) -> bool: ...

    @abstractmethod
    async def suppress(self, email: str, reason: str) -> None: ...
