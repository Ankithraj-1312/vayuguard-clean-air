import os
import sys

# app.py/services use flat imports (e.g. `from services.x import y`) assuming
# the backend/ directory itself is on sys.path, matching how it's run in
# production (uvicorn/Lambda both execute from this directory).
sys.path.insert(0, os.path.dirname(__file__))
