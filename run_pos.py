"""
Main POS System Launcher
Starts backend server and launches the Retail POS Terminal interface.
"""

import sys
import os
import webbrowser
import threading
import time

# Add backend directory to python path
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.join(current_dir, "backend")
sys.path.insert(0, backend_dir)

from server import run_server
from config import PORT, STORE_NAME

def open_browser():
    time.sleep(1.2)
    url = f"http://localhost:{PORT}"
    print(f"\n[+] Opening POS Interface at: {url}")
    try:
        webbrowser.open(url)
    except Exception as e:
        print(f"[-] Could not auto-open browser: {e}")

if __name__ == "__main__":
    print("=" * 60)
    print(f"     {STORE_NAME.upper()} - ENTERPRISE POS")
    print("=" * 60)
    print(f" Starting local retail server on port {PORT}...")
    print(f" Offline-ready ACID SQLite Database active.")
    print("=" * 60)

    # Launch browser in separate thread
    threading.Thread(target=open_browser, daemon=True).start()

    # Run HTTP & API server
    run_server(PORT)
