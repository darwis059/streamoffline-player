import sys
import os

# Add the project root to the path so we can import backend.main
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

response = client.get("/favicon.svg")
print(f"Status Code for /favicon.svg: {response.status_code}")
print(f"Content-Type for /favicon.svg: {response.headers.get('content-type')}")
print(f"Response snippet for /favicon.svg: {response.text[:100]}")

response = client.get("/manifest.webmanifest")
print(f"Status Code for /manifest.webmanifest: {response.status_code}")
print(f"Content-Type for /manifest.webmanifest: {response.headers.get('content-type')}")
print(f"Response snippet for /manifest.webmanifest: {response.text[:100]}")

response = client.get("/sw.js")
print(f"Status Code for /sw.js: {response.status_code}")
print(f"Content-Type for /sw.js: {response.headers.get('content-type')}")
print(f"Response snippet for /sw.js: {response.text[:100]}")
