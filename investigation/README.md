# Investigation

Run the shell script to capture the validate endpoint (the one we're investigating). See **`via_listener.py`** and **`listen.sh`** for usage and overview.

You should be able to just run `./listen.sh`, book a lyft, and then see `via_validate_calls.json` for payloads to the route request endpoint, and `latest_auth.json` for your specific auth token (to input for the attack scripts in `../attack`).
