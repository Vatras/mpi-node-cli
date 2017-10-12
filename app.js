#!/usr/bin/env node
var fs = require('fs');
var net = require('net');
var exec = require('child_process').exec;
var portfinder = require('portfinder');
portfinder.basePort=13110;
var HOST = process.argv[2] || "127.0.0.1"
var PORT = process.argv[3] || 5666;
var mpiCodes='mpiCodes/'
fs.existsSync(mpiCodes) || fs.mkdirSync(mpiCodes);

function closeFile(outputFile,outputFileName,cb){
    outputFile.close(function(){
        exec("tar xvf "+outputFileName+" -C "+mpiCodes,function(){
            exec("rm -f "+outputFileName,function(){
                cb();
            });
        });
    });
}

function initNodes(metadata){
    function getPorts(processesNumber,cb){
        portfinder.getPorts(parseInt(processesNumber),{},function (err, portsArray) {
            console.log(portsArray);
            if(portsArray.length==processesNumber){
                cb(portsArray);
            }
        });

    }
    getPorts(metadata.localProcCount,function(portsMap){
        for(var i = 0; i<metadata.localProcCount; i++) {
            console.log(portsMap);

            exec('node ./'+mpiCodes+metadata.mainFile+'>tid_'+i
                +' -t '+i+
                ' -a '+metadata.initiatorPort+
                ' -h '+metadata.initiatorHost+
                ' -p '+metadata.localProcCount+
                ' -r '+portsMap[i]+
                ' 2>err_tid'+i);
        }
    })
}
var server = net.createServer(function(client) {
    var initialMessage=true;
    var outputFile;
    var outputFileName="tempFile"+getUUID()+".tar";
    var metadata={};
    function addDataToFile(data){
        if(!outputFile)
            outputFile = fs.createWriteStream(outputFileName)
        outputFile.write(new Buffer(data,"binary"))
    }
    client.on('data',function (data){
        console.log(data.toString())
        if(initialMessage){
            initialMessage=false;
            console.log('initialMessage',data.toString())
            var parsedRawData=data.toString()
            var parsedData;
            parsedRawData=parsedRawData.split('$MPISTART$');
            parsedData = parsedRawData[0].split(';');
            metadata={
                localProcCount : parsedData[0],
                initiatorPort : parsedData[1],
                initiatorHost : parsedData[2],
                mainFile : parsedData[3],
                additionalOptions : parsedData[4],
            }
            if(parsedRawData[1]!==''){
                addDataToFile(new Buffer(data,"binary"));
            }
        }else if(data.toString().indexOf('$MPIEND$')>-1){
            var splitted = data.toString().split('$MPIEND$')
            if(splitted[0]!==''){
                addDataToFile(new Buffer(splitted[0],"binary"));
            }
            closeFile(outputFile,outputFileName,function(){
                client.emit('end');
                initNodes(metadata);
            })
        }else{
            addDataToFile(data);
        }
    });
});

server.on('error', function(err) {
    throw new Error("Socket connection error");
});
server.listen(PORT,HOST, function() {
    console.log('socket server started');
});


function getUUID() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }
    return s4() + s4() +  s4() +  s4() +
        s4() + s4() + s4() + s4();
}