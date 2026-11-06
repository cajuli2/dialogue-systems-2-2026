import { defineConfig } from "vite";

// forward /furhat from the browser to furhat API
export default defineConfig({
    server: {
        proxy: {
            "/furhat": "http://127.0.0.1:54321",
        },
    },
});