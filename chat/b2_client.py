# chat/b2_client.py
from decouple import config
from b2sdk.v1      import InMemoryAccountInfo, B2Api
from urllib.parse import quote

# authorize once (this uses InMemoryAccountInfo; for production you can
# swap in a FileSystemAccountInfo if you want local caching of auth tokens)

B2_APPLICATION_KEY_ID = config('B2_APPLICATION_KEY_ID')
B2_APPLICATION_KEY    = config('B2_APPLICATION_KEY')
B2_BUCKET_NAME        = config('B2_BUCKET_NAME')

_info   = InMemoryAccountInfo()
_b2     = B2Api(_info)
_b2.authorize_account(
    "production",
    B2_APPLICATION_KEY_ID,
    B2_APPLICATION_KEY
)
_bucket = _b2.get_bucket_by_name(B2_BUCKET_NAME)

def upload_bytes(data: bytes, file_name: str):
    """
    Upload a bytestring to B2 under `file_name`. Returns the file version dict.
    """
    return _bucket.upload_bytes(data, file_name)

def download_bytes(file_name: str) -> bytes:
    """
    Download the entire file from B2 into memory.
    """
    from io import BytesIO
    stream = BytesIO()
    _bucket.download_file_by_name(file_name).save_to(stream)
    return stream.getvalue()


# capture the base download URL for your account:
DOWNLOAD_URL_TEMPLATE = _info.get_download_url()
# e.g. "https://f000.backblazeb2.com"

def make_presigned_b2_url(file_name: str, valid_seconds: int = 3600) -> str:
    """
    Returns a URL like:
      https://f000.backblazeb2.com/file/your-bucket-name/file_name?Authorization=TOKEN
    that’s valid for `valid_seconds`.
    """
    safe_name = quote(file_name, safe='')  
    # 1) Grab your bucket
    bucket = _b2.get_bucket_by_name(B2_BUCKET_NAME)
    # 2) Issue a download‑authorization token for exactly this file
    auth_token = bucket.get_download_authorization(
        file_name_prefix=file_name,
        valid_duration_in_seconds=valid_seconds
    )
    # 3) Build the full URL
    download_url = (
        f"{DOWNLOAD_URL_TEMPLATE}/file/{B2_BUCKET_NAME}/{safe_name}"
        f"?Authorization={auth_token}"
    )
    # 4) Return the full URL
    return download_url
