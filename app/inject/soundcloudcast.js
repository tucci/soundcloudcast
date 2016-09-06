(function() {
    'use strict';

/**
 * A map of keys for api keys and other things
 * @type {Object}
 */
    var keys = {
        soundcloudClientId: '', // the soundcloud api key
        appId: 'E2447A27', // the app id of the custom receiver
        namespace : 'urn:x-cast:com.soundcloud.cast',
    };

    console.log('soundcloudcast.js loaded');

/**
 * The interface to the soundcloudcast api
 * @type {Object}
 */
    window.soundcloudcast = {
        session: undefined, // the current session to the receiver
        currentMedia: undefined, // the current media being played on the receiver
        receiverState: {
            'isCasting': false, // if the receiver is casting
            'playerState': undefined, // the state of the player on the receiver side
            'volume': undefined,  // volume level
            'currentTime': undefined, // current time in seconds
            'track': undefined // track data
        },
        lastClientState : undefined,
        handleUpdate: function(action, clientState) {
            // Perform actions if we are casting or about to cast
            if (this.receiverState.isCasting || action === 'onCastToggle') {
                // Update and cache the client state
                this.lastClientState = clientState;
                // Call the sender's action
                this[action]();
            }
        },
        notifyReceiver: function() {
            // Message to be sent to our receiever
            var message = {
                receiverState : this.receiverState,
            };
            this.session.sendMessage(keys.namespace, message, function() {
                // Callback our client to update its state and  ui
                soundcloudcast.notifyClient('soundcloudcast_updateClient');
            }, function() { // there was an error sending a message to the receiver
                // Callback our client to update its state and  ui
                soundcloudcast.notifyClient('soundcloudcast_updateClient');
            });
        },
        notifyClient: function(action) {
            if (action === 'soundcloudcast_updateClient' && this.currentMedia) {
                // update the receiver's state
                soundcloudcast.receiverState.playerState = soundcloudcast.currentMedia.playerState;
                if (this.currentMedia.playerState === chrome.cast.media.PlayerState.PLAYING || this.currentMedia.playerState === chrome.cast.media.PlayerState.PAUSED) {
                    // Update our receiver's time with media's time
                    this.receiverState.currentTime = this.currentMedia.currentTime;
                }
                if (this.session.status === chrome.cast.SessionStatus.STOPPED || this.session.status === chrome.cast.SessionStatus.DISCONNECTED) {
                    soundcloudcast.receiverState.isCasting = false;
                } else if (this.session.status === chrome.cast.SessionStatus.CONNECTED) {
                    soundcloudcast.receiverState.isCasting = true;
                }
            }
            // All cast messages are asynchronous
            // So we need a mechanism to pass asynchronous messages without blocking ui
            window.postMessage({
                action: action, // the action to be called on the soundcloud client side
                receiverState: this.receiverState // the updated state of the receiver
            }, window.location.origin);
        },
        onCastToggle: function() {
            // Switch chromecast on or off
            if (this.receiverState.isCasting) {
                // stop the playback on the chromecast
                this.session.stop(function() {
                    // session stop
                    soundcloudcast.notifyReceiver();
                }, function(e) {
                    // session stop fail
                });
            } else {
                // The callback function when we successfully connect to the chromecast
                requestSession(function() {
                    soundcloudcast.onTrackChange();
                });
            }
        },
        onPlayPauseToggle: function() {
            // Check if we have any media loaded in
            if (!this.currentMedia) {
                return;
            }
            if (this.lastClientState.isPlayingOnClient) {
                // play the media on the chromecast
                this.currentMedia.play(null, function() {
                        // play success
                    },
                    function() {
                        // play error
                    });
            } else {
                // pause the media on the chromecast
                this.currentMedia.pause(null, function() {
                    // pause success
                }, function() {
                    // pause error
                });
            }
        },
        onVolumeChange: function() {
            var volume = new chrome.cast.Volume();
            // Update the volume state
            this.receiverState.volume = volume.level = this.lastClientState.clientVolume;
            var volumeRequest = new chrome.cast.media.VolumeRequest(volume);
            this.currentMedia.setVolume(volumeRequest, function() {
                // volume success
            }, function(e) {
                // volume error
            });
        },
        onSeekChange: function() {
            var seekRequest = new chrome.cast.media.SeekRequest();
            seekRequest.currentTime = this.lastClientState.currentTime;
            // When there is a seek request, we want to resume the playback
            seekRequest.resumeState = chrome.cast.media.ResumeState.PLAYBACK_START;
            this.currentMedia.seek(seekRequest, function() {
                // seek success
            }, function(e) {
                // seek failed
            });
        },
        onTrackChange: function() {
            // load the new track from soundcloud into the cast device
            this.loadMedia(this.lastClientState.songLink);
        },
        loadMedia: function(url) {
            var formatUrl = 'https://api.soundcloud.com/resolve.json?' + 'url=' + url + '&client_id=' + keys.soundcloudClientId;

            var resolveXhr = new XMLHttpRequest();
            resolveXhr.onreadystatechange = function() {
                if (resolveXhr.readyState === 4) {
                    var track = JSON.parse(resolveXhr.responseText);
                    // attach the current track data to the receiver for easier data manipulation on the receiver side
                    soundcloudcast.receiverState.track = track;
                    if (track.streamable) {
                        var streamUrl = track.stream_url + '?client_id=' + keys.soundcloudClientId;
                        // Set the media metadata for the cast device to display
                        var mediaInfo = new chrome.cast.media.MediaInfo(streamUrl);
                        mediaInfo.metadata = new chrome.cast.media.GenericMediaMetadata();
                        mediaInfo.metadata.metadataType = chrome.cast.media.MetadataType.MUSIC_TRACK;
                        mediaInfo.metadata.title = track.title;
                        mediaInfo.metadata.artist = track.user.username;
                        mediaInfo.metadata.link = track.permalink_url;
                        var artwork_url = track.artwork_url;

                        // Replace the default artwork size with the large artwork for better resolution
                        if (artwork_url) {
                            artwork_url = artwork_url.replace('large', 't500x500');
                        } else {
                            // If we have no album artwork, grab the user's avatar for the artwork
                            artwork_url = track.user.avatar_url && track.user.avatar_url.replace('large', 't500x500');
                        }

                        mediaInfo.metadata.images = [{
                            'url': artwork_url
                        }];
                        mediaInfo.contentType = 'audio/' + track.original_format;

                        var request = new chrome.cast.media.LoadRequest(mediaInfo);
                        // Autoplay the media
                        request.autoplay = true;
                        // Start with the specified time
                        request.currentTime = soundcloudcast.lastClientState.currentTime;
                        soundcloudcast.session.loadMedia(request,
                            onMediaDiscovered.bind(this, 'loadMedia'),
                            function(e) {
                                soundcloudcast.receiverState.trackIsStreamable = false;
                                // Notify the receiver that the track can't be streamed
                                soundcloudcast.notifyReceiver();
                            });
                    } else {
                        // Notify the receiver that the track can't be streamed
                        soundcloudcast.notifyReceiver();
                    }
                }
            };
            resolveXhr.open('GET', formatUrl, true);
            resolveXhr.send(null);
        }
    };

/**
 * Callback when a cast device is ready
 * @param  {Boolean} loaded
 * @param  {Object} errorInfo
 * @return {void}
 */
    window.__onGCastApiAvailable = function(loaded, errorInfo) {
        if (loaded) {
            initializeCastApi();
        } else {
            // error
        }
    };

/**
 * Called when the cast extension is loaded.
 * @param  {Function} callbackSuccess callback function if the cast api is loaded
 * @return {void}
 */
    function initializeCastApi() {
        var sessionRequest = new chrome.cast.SessionRequest(keys.appId);
        var apiConfig = new chrome.cast.ApiConfig(sessionRequest,
            sessionListener,
            receiverListener);
        chrome.cast.initialize(apiConfig, function() {
            // cast initialize success
            console.log('cast loaded');
        }, function(e) {
            // cast initilazie fail
            console.log(e);
        });
    }

/**
 * The callback listener for when media is loaded/discovered on the cast device
 * @param  {string} how
 * @param  {object} media    the media that was discoverd
 * @return {void}
 */
    function onMediaDiscovered(how, media) {
        soundcloudcast.currentMedia = media;
        // Update the volume on receiver side
        soundcloudcast.onVolumeChange();

        // Listener for when the status of the media changes
        soundcloudcast.currentMedia.addUpdateListener(function(e) {
            // Notify the receiver about media updates
            soundcloudcast.notifyReceiver();
        });
    }

/**
 * Request a session from the chromecast extension
 * @param  {Function} callback the callback function to be called after the session is successfully required
 * @return {void}
 */
    function requestSession(callback) {
        chrome.cast.requestSession(function(e) {
            // When we get new session, assign it to soundcloudcast current session
            soundcloudcast.session = e;
            soundcloudcast.receiverState.isCasting = true;
            // attach a listener for when the session changes
            soundcloudcast.session.addUpdateListener(sessionListener);

            soundcloudcast.session.addMessageListener(keys.namespace, function (ns, message) {
                // do something with the message
            });

            if (callback) {
                callback();
            }
        }, function(e) {
            // launch error
            console.log(e);

        });
    }

/**
 * The callback listener for when the session changees
 * @param  {object} e the session
 * @return {void}
 */
    function sessionListener(e) {
        soundcloudcast.receiverState.isCasting = !!e;
        soundcloudcast.session = e;
        soundcloudcast.notifyReceiver();
    }

/**
 * The callback listener for when the receiver state changes
 * @param  {object} e the session
 * @return {void}
 */
    function receiverListener(e) {
        if (e === chrome.cast.ReceiverAvailability.AVAILABLE) {
            if (!soundcloudcast.session) {
                soundcloudcast.notifyClient('soundcloudcast_init');
            }
        } else {
            soundcloudcast.notifyClient('soundcloudcast_noCastDevice');
        }
    }

}());