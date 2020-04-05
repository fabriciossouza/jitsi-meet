var shot = function() {
    postMessage('takeSnapshot');
    setTimeout("shot()", 3000);
}
shot()
