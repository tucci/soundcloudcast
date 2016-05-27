(function() {
    'use strict';
	var storage = JSON.parse(localStorage.getItem('soundcloudcast'));
	storage = storage || {};
	if (!storage.hasShownInstructions) {
		var instructions = chrome.extension.getURL('app/instructions/instructions.html');
		chrome.tabs.create({'url': instructions});
		localStorage.setItem('soundcloudcast', JSON.stringify({hasShownInstructions: true}));
 	}


 	chrome.runtime.onMessageExternal.addListener(function(request, sender, sendResponse) {
 		if (request.isMuteEvent) {
 			chrome.tabs.update(sender.tab.id, {muted: request.muteValue});
  		}
  	});
 }());