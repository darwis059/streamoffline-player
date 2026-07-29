import os

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend", "dist")

print(f"STATIC_DIR: {STATIC_DIR}")
print(f"Is dir? {os.path.isdir(STATIC_DIR)}")

def check(full_path):
    file_path = os.path.join(STATIC_DIR, full_path)
    print(f"---")
    print(f"full_path: {full_path}")
    print(f"file_path: {file_path}")
    print(f"Is file? {os.path.isfile(file_path)}")

check("favicon.svg")
check("/favicon.svg")
check("manifest.webmanifest")
check("sw.js")
check("registerSW.js")
