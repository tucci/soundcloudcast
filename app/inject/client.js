(function() {
    'use strict';

/**
 * Cache that holds all of the selectors
 * @type {Object}
 */
    var selectors = {};

/**
 * Object to hold extra context data about special events
 * @type {Object}
 */
    var context = {};

/**
 * Flag to check if the cast client has been injected
 * @type {Boolean}
 */
    var injected = false;

/**
 * Injects the cast button, gets the selectors, and attaches the listeners and mutators
 *
 * @return void
 */
    function init() {
        if (injected) {
            return;
        }

        // Create and inject the cast button
        var castButton = document.createElement('li');
        castButton.className = 'playControls__chromecast';
        castButton.innerHTML = 
            '<button title="Cast to chromecast" class="castControl sc-ir">'
                + 'Cast to chromecast'
            + '</button>';

        // Get the button to where the cast button should be injected into the page
        var repeatButton = document.getElementsByClassName('playControls__repeat')[0];
        repeatButton.parentElement.insertBefore(castButton, repeatButton);
        castButton = document.querySelector('.castControl');
        castButton.addEventListener('click', function(e) {
            notifyReceiver('onCastToggle');
        });

        // Get all the selectors from the page
        selectors = {
            'cast': castButton,
            'playPause': document.querySelector('.playControl'),
            'volume': document.querySelector('.volume'),
            'soundBadge': document.querySelector('.playbackSoundBadge'),
            'timePassed': document.querySelector('.playbackTimeline__timePassed')
        };
    
        // Set up the playcontext
        selectors.playPause.dataset.playcontext = '';
        // Add all the mutation observers to our play selectors
        // Add observer for when the play/pause status changes
        var observePlayPauseTarget = selectors.playPause;
        var playPauseObserver = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                // When the class is changed, then the play pause was toggled
                if (mutation.attributeName === 'class') {
                    if (selectors.playPause.dataset.playcontext !== 'from_cast') {
                        notifyReceiver('onPlayPauseToggle');
                    }
                    // update the context
                    selectors.playPause.dataset.playcontext = 'from_user';
                }
            });
        });

        // Add mutator observer to check for when the track changes
        var observeTrackTarget = selectors.soundBadge;
        var trackObserver = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.addedNodes.length !== 0) {
                    var nodes = mutation.addedNodes;
                    for (var i = 0; i < nodes.length; i++) {
                        var node = nodes[i];
                        if (node.className === 'playbackSoundBadge__titleContextContainer') {
                            context.songIsLoaded = false;
                            // if the track changes, we need to notify the receiver of the track change
                            notifyReceiver('onTrackChange');
                        }
                    }
                }
            });
        });
        
        // We need to check for when the time changes from the user
        var observeTimeTarget = selectors.timePassed; 
        var lastSecond;
        var timeObserver = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                // Get the current time of the player in seconds
                var now = mutation.addedNodes[1].textContent;
                now = timeToSeconds(now);
                // if change in seconds is > 1, than the user changed the time
                if (lastSecond && ((Math.abs(now - lastSecond)) > 1) && context.songIsLoaded) {
                    // notify the receiver that the progress needs to be changed
                    notifyReceiver('onSeekChange');
                }
                lastSecond = now;
            });
        });

        // We need to check for when the volume changes from the user
        var observeVolumeTarget = selectors.volume;
        var volumeObserver = new MutationObserver(function(mutation) {
            mutation.forEach(function(mutation) {
                if (mutation.attributeName === 'data-level') {
                    notifyReceiver('onVolumeChange');
                }
            });
        });

        playPauseObserver.observe(observePlayPauseTarget, {'attributes': true});
        trackObserver.observe(observeTrackTarget, {'childList': true});
        timeObserver.observe(observeTimeTarget, {'childList': true});
        volumeObserver.observe(observeVolumeTarget, {'attributes': true});
        injected = true;
    }

/**
 * Update the client side ui and state
 * @param  {object} receiverState the state of the receiver that called this 
 * @return void 
 */
    function updateClient(receiverState) {
        if (receiverState.isCasting) {
            selectors.cast.classList.add('casting');
            var playPauseButton = selectors.playPause;
            // Update our context
            context.songIsLoaded = true;
            if (receiverState.playerState === chrome.cast.media.PlayerState.PLAYING) {
                if (!playPauseButton.classList.contains('playing')) {
                    selectors.playPause.dataset.playcontext = 'from_cast';
                    playPauseButton.click();
                }
            } else if (receiverState.playerState === chrome.cast.media.PlayerState.PAUSED) {
                if (playPauseButton.classList.contains('playing')) {
                    selectors.playPause.dataset.playcontext = 'from_cast';
                    playPauseButton.click();
                }
            } else if (receiverState.playerState === chrome.cast.media.PlayerState.BUFFERING) {
                
            }
        } else {
            selectors.cast.classList.remove('casting');
        }
    }

/**
 * Notify the receiver of the client action to be updated on the receiever state
 * @param  {string} clientAction the action that client wants to notify the receiever about
 * @return {void}
 */
    function notifyReceiver(clientAction) {
        context.previousAction = clientAction;
        // Get the current client side state
        var clientState = {
            'songLink': document.querySelector('.playbackSoundBadge__title').href,
            'isPlayingOnClient': selectors.playPause.classList.contains('playing'),
            'clientVolume': +(selectors.volume.getAttribute('data-level')) / 10.0,
            'currentTime': timeToSeconds(selectors.timePassed.children[1].textContent)
        };
        if (clientAction === 'onCastToggle' && clientState.isPlayingOnClient) {
            // Pause it before switching to the cast device
            selectors.playPause.click();
            selectors.playPause.dataset.playcontext = 'from_cast';
            clientState.isPlayingOnClient = false;
        }
        soundcloudcast.handleUpdate(clientAction, clientState);
    }

/**
 * Turns a hh:mm:ss string into seconds
 * @param  {string} hhmmss the formatted string as hh:mm:ss
 * @return {int}    returns the time in seconds as an integer
 */
    function timeToSeconds(hhmmss) {
        var time = hhmmss.split(':');
        var seconds = 0;
        if (time.length === 3) {
            seconds = ((+time[0]) * 3600 + (+time[1]) * 60 + (+time[2])) * 1;
        } else if (time.length === 2) {
            seconds = ((+time[0]) * 60 + (+time[1])) * 1;
        } else if (time.length === 1) {
            seconds = (+time[0]) * 1;
        }
        return seconds;
    }
    
    // attach a listener to receive updates from soundcloudcast
    window.addEventListener('message', function(event) {

        // We only accept messages from ourselves
        if (event.source !== window && event.origin !== window.location.origin) {
            return;
        }

        if (event.data.action) {
            if (event.data.action === 'soundcloudcast_updateClient') {
                // update client side ui/data
                updateClient(event.data.receiverState);
            } else if (event.data.action === 'soundcloudcast_init') {
                init();
            } else if (event.data.action === 'soundcloudcast_noCastDevice') {
                injected = false;
                selectors.cast && selectors.cast.parentNode.removeChild(selectors.cast);
            }
        }
    }, false);

}());