#!/usr/bin/env node

const fs = require("fs");
const path = require('path');
const pkg = require("./package-template.json");

let arg = "./example";
let flowfile = null;
let dn = arg;
let app;
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

const merge = {
    ...app.dependencies,
    ...pkg.dependencies
};

pkg.dependencies = merge;
// Try to get flow file name
if (app.hasOwnProperty("node-red") && app["node-red"].hasOwnProperty("settings") && app["node-red"].settings.hasOwnProperty("flowFile") ) {
    pkg.NRelectron.flowFile = app["node-red"].settings.flowFile; 
}
else if (app.hasOwnProperty("scripts") && app.scripts.hasOwnProperty("start")) {
    pkg.NRelectron.flowFile = app.scripts.start.split(' ').pop();
}
else {
    pkg.NRelectron.flowFile = flowfile || "flow.json";
}

if (merge.hasOwnProperty("node-red-dashboard")) {
    pkg.NRelectron.start = "dashboard";
}
pkg.name = app.name;
pkg.version = app.version;
pkg.description = app.description;
// console.log(pkg);

fs.copyFile(path.join(arg, pkg.NRelectron.flowFile), path.join("./", pkg.NRelectron.flowFile), (err) => {
    if (err) { console.log("Failed to copy flows file - "+path.join(arg, pkg.NRelectron.flowFile)); }
    else { console.log('Copied flows file - '+pkg.NRelectron.flowFile); }
});
const creds = path.basename(pkg.NRelectron.flowFile,".json")+"_cred.json";
fs.copyFile(path.join(arg, creds), path.join("./", creds), (err) => {
    if (err) { console.log("Failed to copy creds file - "+path.join(arg, creds)); }
    else { console.log('Copied creds file - '+creds); }
});

fs.writeFile("./package.json", JSON.stringify(pkg, null, 4), 'utf8', function (err) {
    if (err) { console.log("Failed to re-write package.json file."); }
    else {
        console.log("Merged package.json.");
    }
});
