import httpx


class ExpoPushClient:
    """Expo's push service — a single HTTP endpoint that fans out to APNs/FCM
    for us, so there's no separate Apple/Google push credential wiring on our
    side beyond what `expo-notifications` + EAS already handles client-side.
    """

    _URL = "https://exp.host/--/api/v2/push/send"

    async def send(self, token: str, title: str, body: str) -> None:
        async with httpx.AsyncClient() as client:
            await client.post(
                self._URL,
                json={"to": token, "title": title, "body": body, "sound": "default"},
                headers={"Content-Type": "application/json"},
            )
