Package["core-runtime"].queue("ddp",function () {/* Imports */
var DDP = Package['ddp-client'].DDP;
var DDPServer = Package['ddp-server'].DDPServer;



/* Exports */
return {
  export: function () { return {
      DDP: DDP,
      DDPServer: DDPServer
    };}
}});
