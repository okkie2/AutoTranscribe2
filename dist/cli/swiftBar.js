#!/usr/bin/env node
import fs from "node:fs";
import { renderSwiftBarMenu, renderSwiftBarUnavailable } from "../application/SwiftBarMenu.js";
function main() {
    const pluginPath = process.argv[2];
    if (!pluginPath) {
        console.log(renderSwiftBarUnavailable("Plugin path was not supplied."));
        process.exit(1);
    }
    try {
        const snapshot = JSON.parse(fs.readFileSync(0, "utf8"));
        console.log(renderSwiftBarMenu(snapshot, pluginPath));
    }
    catch {
        console.log(renderSwiftBarUnavailable("The JSON status command returned invalid output."));
        process.exit(1);
    }
}
main();
