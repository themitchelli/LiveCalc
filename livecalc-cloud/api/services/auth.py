"""
JWT authentication and authorization for cloud API.
"""
from typing import Optional
from fastapi import HTTPException, Header, status
from jose import JWTError, jwt
import httpx
import logging

logger = logging.getLogger(__name__)


class AuthService:
    """Service for JWT token validation."""

    def __init__(self, am_url: str, jwks_cache_ttl: int = 3600):
        """
        Initialize auth service.

        Args:
            am_url: Assumptions Manager base URL
            jwks_cache_ttl: JWKS cache TTL in seconds
        """
        self.am_url = am_url.rstrip("/")
        self.jwks_cache_ttl = jwks_cache_ttl
        self._jwks_cache: Optional[dict] = None
        self._jwks_cache_time: Optional[float] = None

    async def get_jwks(self) -> dict:
        """
        Fetch JWKS from Assumptions Manager.

        Returns:
            JWKS dictionary
        """
        import time
        current_time = time.time()

        # Check cache
        if (
            self._jwks_cache is not None
            and self._jwks_cache_time is not None
            and current_time - self._jwks_cache_time < self.jwks_cache_ttl
        ):
            return self._jwks_cache

        # Fetch from AM
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{self.am_url}/.well-known/jwks.json",
                    timeout=10.0
                )
                response.raise_for_status()
                jwks = response.json()

                # Update cache
                self._jwks_cache = jwks
                self._jwks_cache_time = current_time

                return jwks
            except Exception as e:
                logger.error(f"Failed to fetch JWKS: {e}")
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Unable to verify authentication - Assumptions Manager unavailable"
                )

    async def verify_token(self, authorization: str) -> dict:
        """
        Verify JWT token and extract claims.

        Args:
            authorization: Authorization header value (Bearer <token>)

        Returns:
            Token payload with claims

        Raises:
            HTTPException: If token is invalid or missing
        """
        if not authorization:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing Authorization header",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Extract token from Bearer scheme
        parts = authorization.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Authorization header format. Expected: Bearer <token>",
                headers={"WWW-Authenticate": "Bearer"},
            )

        token = parts[1]

        try:
            # Decode header to get kid (key ID)
            unverified_header = jwt.get_unverified_header(token)
            kid = unverified_header.get("kid")

            if not kid:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token missing 'kid' in header"
                )

            # Get JWKS and find matching key
            jwks = await self.get_jwks()
            key = None
            for jwk in jwks.get("keys", []):
                if jwk.get("kid") == kid:
                    key = jwk
                    break

            if not key:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"No matching key found for kid: {kid}"
                )

            # Verify and decode token
            payload = jwt.decode(
                token,
                key,
                algorithms=["RS256"],
                options={"verify_aud": False}  # AM may not set audience
            )

            # Extract required claims
            tenant_id = payload.get("tenant_id") or payload.get("tid")
            user_id = payload.get("user_id") or payload.get("sub")

            if not tenant_id or not user_id:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token missing required claims (tenant_id, user_id)"
                )

            return {
                "tenant_id": tenant_id,
                "user_id": user_id,
                "email": payload.get("email"),
                "name": payload.get("name"),
                "exp": payload.get("exp")
            }

        except JWTError as e:
            logger.warning(f"JWT validation failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            )


# Dependency for route handlers
async def get_current_user(
    authorization: str = Header(None, alias="Authorization")
) -> dict:
    """
    FastAPI dependency to extract and verify JWT token.

    Args:
        authorization: Authorization header

    Returns:
        User claims from token
    """
    from main import auth_service  # Import from main to avoid circular dependency
    return await auth_service.verify_token(authorization)
