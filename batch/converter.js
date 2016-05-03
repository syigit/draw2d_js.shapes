var webPage = require('webpage');
var fs      = require('fs');
var system  = require('system');
var page    = webPage.create();

var acorn = require('acorn');
var escodegen = require('escodegen');
var estraverse = require("estraverse");


var calculateNode = null;
function dumpCalculate(node) {
    try {
        if (node.key.name == "calculate") {
            if (node.value.type = "FunctionExpression") {
                calculateNode = node;
            }
        }
    }
    catch(exc){}
    return node;
}

function escapeString(string) {
    return ('' + string).replace(/["'\\\n\r\u2028\u2029]/g, function (character) {
        // Escape all characters not included in SingleStringCharacters and
        // DoubleStringCharacters on
        // http://www.ecma-international.org/ecma-262/5.1/#sec-7.8.4
        switch (character) {
            case '"':
            case "'":
            case '\\':
                return '\\' + character;
            // Four possible LineTerminator characters need to be escaped:
            case '\n':
                return '\\n';
            case '\r':
                return '\\r';
            case '\u2028':
                return '\\u2028';
            case '\u2029':
                return '\\u2029'
        }
    })
}

function waitFor ($config) {
    $config._start = $config._start || new Date();

    if ($config.timeout && new Date - $config._start > $config.timeout) {
        if ($config.error) $config.error();
        if ($config.debug) console.log('timedout ' + (new Date - $config._start) + 'ms');
        return;
    }

    if ($config.check()) {
        if ($config.debug) console.log('success ' + (new Date - $config._start) + 'ms');
        return $config.success();
    }

    setTimeout(waitFor, $config.interval || 0, $config);
}

if (!String.prototype.endsWith) {
    String.prototype.endsWith = function(searchString, position) {
        var subjectString = this.toString();
        if (typeof position !== 'number' || !isFinite(position) || Math.floor(position) !== position || position > subjectString.length) {
            position = subjectString.length;
        }
        position -= searchString.length;
        var lastIndex = subjectString.indexOf(searchString, position);
        return lastIndex !== -1 && lastIndex === position;
    };
}

var filesToProcess = [];

var scanDirectory = function (path) {
    if (fs.exists(path) && fs.isFile(path)) {
        if(path.endsWith(".shape")){
            filesToProcess.push(path);
        }

    } else if (fs.isDirectory(path)) {
        fs.list(path).forEach(function (e) {
            if ( e !== "." && e !== ".." ) {    //< Avoid loops
                scanDirectory(path + '/' + e);
            }
        });
    }
};

var processFiles=function(path){

    console.log("Processing: "+path);
    var json = fs.read(path);
    var code = fs.read("batch/template.js");
    fs.write("batch/exporter.js", "var json="+json+";\n"+code);
    if (page.injectJs('batch/exporter.js')) {
        waitFor({
            check: function () {
                return page.evaluate(function () {
                    return code !== null;
                });
            },
            success: function () {
                var jsCode   = page.evaluate(function () {return code;});
                var markdown = page.evaluate(function () {return markdown;});
                var img      = page.evaluate(function () {return img;});
                var package = path.replace("./shapes/org/","").replace(/\//g,"_").replace(/\.shape/,"");
                var pngFilePath = path.replace(".shape",".png");
                var jsFilePath  = path.replace(".shape",".js");

                jsCode = jsCode.replace(/testShape/g,package);

                // Extract the "calculate" method from the shape and add them as "readable" property to the shape
                // This property is used in the DigitalTrainingStudio as context information to the shape
                // itself
                //
                (function(){
                    calculateNode = null;
                    var ast = acorn.parse(jsCode);

                    estraverse.traverse(ast, {
                        enter: function (node) {
                            switch (node.type) {
                                case "Property":
                                    dumpCalculate(node);
                                    break;
                            }
                        }
                    });

                    // add the "calculate" code as text to the shape
                    //
                    if (calculateNode != null) {
                        var modified_code = escodegen.generate(calculateNode);
                        jsCode = jsCode+"\n"+package+".logic=\""+escapeString(modified_code)+"\";";
                    }

                    // add the github path as text to the shape
                    //
                    jsCode = jsCode+"\n"+package+".github=\""+path+"\";";
                    jsCode = jsCode+"\n"+package+".markdown=\""+escapeString(markdown)+"\";";
                })();


                fs.write(jsFilePath, jsCode);
                fs.write(pngFilePath, atob(img), "wb");

                if(filesToProcess.length>0){
                    processFiles(filesToProcess.pop());
                }
                else{
                    phantom.exit(0);
                }
            },
            error: function () {
                console.log("error found");
            } // optional
        });
    }

};

page.onConsoleMessage = function(msg, lineNum, sourceId) {
    console.log('CONSOLE: ' + msg + ' (from line #' + lineNum + ' in "' + sourceId + '")');
};

page.viewportSize = { width: 900, height: 900 };

page.open('http://freegroup.github.io/draw2d_js.app.shape_designer/', function(status) {
    if (status === "success") {
        scanDirectory("./shapes/org");
        if(filesToProcess.length>0){
            processFiles(filesToProcess.pop());
        }
    }
});
