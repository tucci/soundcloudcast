(function() {
    'use strict';

    var injectPath = 'app/inject/';
    
    // Scripts to be injected
    var scripts = [
        'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js',
        chrome.extension.getURL(injectPath + 'soundcloudcast.js'),
        chrome.extension.getURL(injectPath + 'client.js')
    ];

    for (var i = 0; i < scripts.length; i++) {
        var script = scripts[i];
        var scriptElement = document.createElement('script');
        scriptElement.setAttribute('type', 'text/javascript');
        scriptElement.setAttribute('src', script);
        document.head.appendChild(scriptElement);
    }

}());