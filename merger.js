#!/usr/bin/env node

const fs = require("fs");
const path = require('path');
const pkg = require("./package-template.json");

let arg = "./example";
let flowfile = null;
let dn = arg;
let app;
// If extra param specified then is it a directory or a package or flow file ?
if (process.argv.length === 3 ) {
    arg = process.argv[2];

    let dn = path.dirname(arg);
    if (path.extname(arg) === ".json") {
        if (path.basename(arg, '.json') !== "package") {
            flowfile = path.basename(arg);
            app = require(path.join(dn, "package.json"));
        }
        else {
            app = require(arg);
        }
    }
    else {
        app = require(path.join(arg, "package.json"));
        dn = arg;
    }
}
else {
    app = require(arg+"/package.json");
}

// Merge electron settings over project settings (project has priority)
const merge = {
    ...app.dependencies,
    ...pkg.dependencies
};

pkg.dependencies = merge;
// Try to get flow file name from package.json setiings
if (app.hasOwnProperty("node-red") && app["node-red"].hasOwnProperty("settings") && app["node-red"].settings.hasOwnProperty("flowFile") ) {
    pkg.NRelectron.flowFile = app["node-red"].settings.flowFile;
} // or the npm scripts if there is a run command
else if (app.hasOwnProperty("scripts") && app.scripts.hasOwnProperty("start")) {
    pkg.NRelectron.flowFile = app.scripts.start.split(' ').pop();
} // or the command line if the user gave us a name - or just guess flow.json.
else {
    pkg.NRelectron.flowFile = flowfile || "flow.json";
}

// If dashboard is in package.json assume start with dashboard.
if (merge.hasOwnProperty("node-red-dashboard")) {
    pkg.NRelectron.start = "dashboard";
}
// If map is not in package.json then force it to be hidden
if (!merge.hasOwnProperty("node-red-contrib-web-worldmap")) {
    pkg.NRelectron.showmap = false;
}
pkg.name = app.name;
pkg.version = app.version;
pkg.description = app.description;
// console.log(pkg);

// Copy over existing flow file and creds file
fs.copyFile(path.join(arg, pkg.NRelectron.flowFile), path.join("./", pkg.NRelectron.flowFile), (err) => {
    if (err) { console.log("Failed to copy flows file - "+path.join(arg, pkg.NRelectron.flowFile)); }
    else { console.log('Copied flows file - '+pkg.NRelectron.flowFile); }
});
const creds = path.basename(pkg.NRelectron.flowFile,".json")+"_cred.json";
fs.copyFile(path.join(arg, creds), path.join("./", creds), (err) => {
    if (err) { console.log("Failed to copy creds file - "+path.join(arg, creds)); }
    else { console.log('Copied creds file - '+creds); }
});

// Finally re-write the new package.json
fs.writeFile("./package.json", JSON.stringify(pkg, null, 4), 'utf8', function (err) {
    if (err) { console.log("Failed to re-write package.json file."); }
    else {
        console.log("Merged package.json");
        console.log("OK - you can now run    yarn");
        console.log("and then   yarn start   to run");
        console.log("      or   yarn dist    to build");
    }
});
