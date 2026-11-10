var L='en';window.__changes=0;
Stickers.init({layer:document.getElementById('layer'),tray:document.getElementById('tray'),getLang:function(){return L},onchange:function(){window.__changes++}});
Stickers.load();
document.getElementById('lang').onclick=function(){L=L==='en'?'zh-CN':'en';Stickers.refreshLabels()};
