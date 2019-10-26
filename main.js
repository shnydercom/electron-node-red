
'use strict';

// Some settings you can edit easily

const editable = true;              // Set this to false to create a run only application - no editor/no console
const allowLoadSave = false;        // set to true to allow import and export of flow file
const showMap = false;              // set to true to add Worldmap to the menu
const kioskMode = false;            // set to true to start in kiosk mode

let flowfile = 'electronflow.json'; // default Flows file name - loaded at start
const urldash = "/ui/#/0";          // Start on the dashboard page
const urledit = "/red";             // url for the editor page
const urlconsole = "/console.htm";  // url for the console page
const urlmap = "/worldmap";         // url for the worldmap
const nrIcon = "nodered.png"        // Icon for the app in root dir (usually 256x256)

// TCP port to use
//const listenPort = "18880";                           // fix it if you like
const listenPort = parseInt(Math.random()*16383+49152)  // or random ephemeral port

const os = require('os');
const fs = require('fs');
const url = require('url');
const path = require('path');
const http = require('http');
const express = require("express");
const electron = require('electron');

const {app, Menu} = electron;
const ipc = electron.ipcMain;
const dialog = electron.dialog;
const BrowserWindow = electron.BrowserWindow;

var RED = require("node-red");
var red_app = express();

// Add a simple route for static content served from 'public'
red_app.use("/",express.static("web"));
//red_app.use(express.static(__dirname +"/public"));

// Create a server
var server = http.createServer(red_app);

// Setup user directory and flowfile
var userdir = __dirname;
if (editable) {
    // if running as raw electron use the current directory (mainly for dev)
    if (process.argv[1] && (process.argv[1] === "main.js")) {
        userdir = __dirname;
        if ((process.argv.length > 2) && (process.argv[process.argv.length-1].indexOf(".json") > -1)) {
            if (path.isAbsolute(process.argv[process.argv.length-1])) {
                flowfile = process.argv[process.argv.length-1];
            }
            else {
                flowfile = path.join(process.cwd(),process.argv[process.argv.length-1]);
            }
        }
    }
    else { // We set the user directory to be in the users home directory...
        userdir = os.homedir() + '/.node-red';
        if (!fs.existsSync(userdir)) {
            fs.mkdirSync(userdir);
        }
        if ((process.argv.length > 1) && (process.argv[process.argv.length-1].indexOf(".json") > -1)) {
            if (path.isAbsolute(process.argv[process.argv.length-1])) {
                flowfile = process.argv[process.argv.length-1];
            }
            else {
                flowfile = path.join(process.cwd(),process.argv[process.argv.length-1]);
            }
        }
        else {
            if (!fs.existsSync(userdir+"/"+flowfile)) {
                fs.writeFileSync(userdir+"/"+flowfile, fs.readFileSync(__dirname+"/"+flowfile));
            }
            let credFile = flowfile.replace(".json","_cred.json");
            if (fs.existsSync(__dirname+"/"+credFile) && !fs.existsSync(userdir+"/"+credFile)) {
                fs.writeFileSync(userdir+"/"+credFile, fs.readFileSync(__dirname+"/"+credFile));
            }
        }
    }
}
// console.log("CWD",process.cwd());
// console.log("DIR",__dirname);
// console.log("UserDir :",userdir);
// console.log("FlowFile :",flowfile);
// console.log("PORT",listenPort);

// Keep a global reference of the window objects, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;
let conWindow;
let logBuffer = [];
let logLength = 250;    // No. of lines of console log to keep.
const levels = [ "", "fatal", "error", "warn", "info", "debug", "trace" ];

ipc.on('clearLogBuffer', function() { logBuffer = []; });

// Create the settings object - see default settings.js file for other options
var settings = {
    uiHost: "localhost",    // only allow local connections, remove if you want to allow external access
    httpAdminRoot: "/red",  // set to false to disable editor and deploy
    httpNodeRoot: "/",
    userDir: userdir,
    flowFile: flowfile,
    editorTheme: { projects:{ enabled:false } },    // enable projects feature
    functionGlobalContext: { },    // enables global context - add extras ehre if you need them
    logging: {
        websock: {
            level: 'info',
            metrics: false,
            handler: function() {
                return function(msg) {
                    if (editable) {  // No logging if not editable
                        var ts = (new Date(msg.timestamp)).toISOString();
                        ts = ts.replace("Z"," ").replace("T"," ");
                        var line = "";
                        if (msg.type && msg.id) {
                            line = ts+" : ["+levels[msg.level/10]+"] ["+msg.type+":"+msg.id+"] "+msg.msg;
                        }
                        else {
                            line = ts+" : ["+levels[msg.level/10]+"] "+msg.msg;
                        }
                        logBuffer.push(line);
                        if (conWindow) { conWindow.webContents.send('debugMsg', line); }
                        if (logBuffer.length > logLength) { logBuffer.shift(); }
                    }
                }
            }
        }
    }
};
if (!editable) {
    settings.httpAdminRoot = false;
    settings.readOnly = true;
}

// Initialise the runtime with a server and settings
RED.init(server,settings);

// Serve the editor UI from /red (if editable)
if (settings.httpAdminRoot !== false) {
    red_app.use(settings.httpAdminRoot,RED.httpAdmin);
}

// Serve the http nodes UI from /
red_app.use(settings.httpNodeRoot,RED.httpNode);

// Create the Application's main menu
var template = [];
if (process.platform === 'darwin') { // Mac has it's own first menu
    template.push( {
        label: app.getName(),
        submenu: [
            { type: 'separator' },
            { type: 'separator' },
            { role: 'about' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideothers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'togglefullscreen' },
            { role: 'quit' }        
        ]
    } )
}
// Now add the main Node-RED menu
template.push(
    { label: 'Node-RED',
        submenu: [
            {   label: 'Import Flow',
                accelerator: "Shift+CmdOrCtrl+O",
                click() { openFlow(); }
            },
            {   label: 'Save Flow As',
                accelerator: "Shift+CmdOrCtrl+S",
                click() { saveFlow(); }
            },
            {   type: 'separator' },
            {   label: 'Console',
                accelerator: "Shift+CmdOrCtrl+C",
                click() { createConsole(); }
            },
            {   label: 'Dashboard',
                accelerator: "Shift+CmdOrCtrl+D",
                click() { mainWindow.loadURL("http://localhost:"+listenPort+urldash); }
            },
            {   label: 'Editor',
                accelerator: "Shift+CmdOrCtrl+E",
                click() { mainWindow.loadURL("http://localhost:"+listenPort+urledit); }
            },
            {   label: 'Worldmap',
                accelerator: "Shift+CmdOrCtrl+M",
                click() { mainWindow.loadURL("http://localhost:"+listenPort+urlmap); }
            },
            {   type: 'separator' },
            {   type: 'separator' },
            {   label: 'Documentation',
                click() { electron.shell.openExternal('https://nodered.org/docs') }
            },
            {   label: 'Flows and Nodes',
                click() { electron.shell.openExternal('https://flows.nodered.org') }
            },
            {   label: 'Discourse Forum',
                click() { electron.shell.openExternal('https://discourse.nodered.org/') }
            }
        ]
    }
);

var tempNum = template.length - 1;
// Add quit and toggle full screen to this menu if not on Mac
if (process.platform !== 'darwin') {
    template[tempNum].submenu.push({ type: "separator" });
    template[tempNum].submenu.push({ role: 'togglefullscreen' });
    template[tempNum].submenu.push({ role: 'quit' });
    if (!showMap) { template[tempNum].submenu.splice(8,1); }
}
else {
    if (!showMap) { template[tempNum].submenu.splice(6,1); }
}

if (!editable) {
    template[tempNum].submenu.splice(3,1);
    template[tempNum].submenu.splice(4,1);
}

if (!allowLoadSave) { template[tempNum].submenu.splice(0,2); }

let fileName = "";
function saveFlow() {
    dialog.showSaveDialog({
        filters:[{ name:'JSON', extensions:['json'] }],
        defaultPath: fileName
    }, function(file_path) {
        if (file_path) {
            var flo = JSON.stringify(RED.nodes.getFlows().flows);
            fs.writeFile(file_path, flo, function(err) {
                if (err) { dialog.showErrorBox('Error', err); }
                else {
                    dialog.showMessageBox({
                        icon: nrIcon,
                        message:"Flow file saved as\n\n"+file_path,
                        buttons: ["OK"]
                    });
                }
            });
        }
    });
}

function openFlow() {
    dialog.showOpenDialog({ filters:[{ name:'JSON', extensions:['json']} ]},
        function (fileNames) {
            if (fileNames && fileNames.length > 0) {
                fs.readFile(fileNames[0], 'utf-8', function (err, data) {
                    try {
                        var flo = JSON.parse(data);
                        if (Array.isArray(flo) && (flo.length > 0)) {
                            RED.nodes.setFlows(flo,"full");
                            fileName = fileNames[0];
                        }
                        else {
                            dialog.showErrorBox("Error", "Failed to parse flow file.\n\n  "+fileNames[0]+".\n\nAre you sure it's a flow file ?");
                        }
                    }
                    catch(e) {
                        dialog.showErrorBox("Error", "Failed to load flow file.\n\n  "+fileNames[0]);
                    }
                });
            }
        }
    )
}

// Create the console log window
function createConsole() {
    if (conWindow) { conWindow.show(); return; }
    // Create the hidden console window
    conWindow = new BrowserWindow({
        title: "Node-RED Console",
        width: 800,
        height: 600,
        icon: path.join(__dirname, nrIcon),
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true
        }
    });
    conWindow.loadURL(url.format({
        pathname: path.join(__dirname, urlconsole),
        protocol: 'file:',
        slashes: true
    }))
    conWindow.webContents.on('did-finish-load', () => {
        conWindow.webContents.send('logBuff', logBuffer);
    });
    conWindow.on('closed', () => {
        conWindow = null;
    });
    //conWindow.webContents.openDevTools();
}

// Create the main browser window
function createWindow() {
    mainWindow = new BrowserWindow({
        title: "Node-RED",
        width: 1024,
        height: 768,
        icon: path.join(__dirname, nrIcon),
        fullscreenable: true,
        kiosk: kioskMode,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false
        }
    });
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    mainWindow.loadURL(`file://${__dirname}/load.html`);
    //if (process.platform !== 'darwin') { mainWindow.setAutoHideMenuBar(true); }

    mainWindow.webContents.on('did-get-response-details', function(event, status, newURL, originalURL, httpResponseCode) {
        if ((httpResponseCode == 404) && (newURL == ("http://localhost:"+listenPort+urldash))) {
            setTimeout(mainWindow.webContents.reload, 250);
        }
    });

    // mainWindow.webContents.on('did-finish-load', (a) => {
    //     console.log("FINISHED LOAD",a);
    // });

    mainWindow.webContents.on("new-window", function(e, url, frameName, disposition, options) {
        // if a child window opens... modify any other options such as width/height, etc
        // in this case make the child overlap the parent exactly...
        //console.log("NEW WINDOW",url);
        var w = mainWindow.getBounds();
        options.x = w.x;
        options.y = w.y;
        options.width = w.width;
        options.height = w.height;
    })

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Start the app full screen
    //mainWindow.setFullScreen(true)

    // Open the DevTools at start
    //mainWindow.webContents.openDevTools();
}

// Called when Electron has finished initialization and is ready to create browser windows.
app.on('ready', createWindow );

// Quit when all windows are closed.
app.on('window-all-closed', function () {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') { app.quit(); }
});

app.on('activate', function() {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
        createWindow();
        mainWindow.loadURL("http://localhost:"+listenPort+urldash);
    }
});

// Start the Node-RED runtime, then load the inital dashboard page
RED.start().then(function() {
    server.listen(listenPort,"localhost",function() {
        mainWindow.loadURL("http://localhost:"+listenPort+urldash);
    });
});