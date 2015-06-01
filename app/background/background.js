chrome.runtime.onInstalled.addListener(function() {
	var instructions = chrome.extension.getURL('app/instructions/instructions.html');
	chrome.tabs.create({'url': instructions});
});