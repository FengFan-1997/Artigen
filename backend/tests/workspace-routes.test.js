const test = require('node:test');
const assert = require('node:assert/strict');
const {once} = require('node:events');
const express = require('express');
const {installWorkspaceRoutes} = require('../routes/workspace');

test('workspace routes require authentication and cannot accept body owner or path overrides',async()=>{
 const app=express();app.use(express.json());
 const owner='11111111-1111-4111-8111-111111111111';
 const project='22222222-2222-4222-8222-222222222222';
 const file='33333333-3333-4333-8333-333333333333';
 app.use((req,_res,next)=>{req.authResolution=req.headers['x-test-auth']==='yes'?{ok:true,userId:owner}:{ok:false,status:401,error:'LOGIN_REQUIRED'};next();});
 const installed=installWorkspaceRoutes(app,{pool:{},connector:{requestReadOnly:async()=>({data:[]})},service:{transaction:()=>{}},env:{NODE_ENV:'test'}});
 const saves=[];installed.files.save=async input=>{saves.push(input);return {id:file};};
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 try {
  const unauthorized=await fetch(base+'/api/workspace/navigation');assert.equal(unauthorized.status,401);
  for(const [method,path] of [['POST',''],['PUT','/'+file]]) {
   const response=await fetch(`${base}/api/workspace/projects/${project}/files${path}`,{method,headers:{'Content-Type':'application/json','x-test-auth':'yes'},body:JSON.stringify({userId:'spoofed',projectId:'spoofed',fileId:'spoofed',text:'fixture',expectedRevision:0,path:'notes.md'})});
   assert.equal(response.status,200);assert.equal(saves.at(-1).userId,owner);assert.equal(saves.at(-1).projectId,project);assert.equal(saves.at(-1).fileId,method==='PUT'?file:null);
  }
 } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
