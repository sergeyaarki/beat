// Aarki Beat

window.beat = null;

(function(wnd) {
    BeatConstruct = function(trackURL, useEventQueue, queueInterval, usePixelforTracking, trackBulkURL) {
        this.init(trackURL, useEventQueue, queueInterval, usePixelforTracking, trackBulkURL);
    };

    BeatConstruct.prototype = {
        /*
        * Fields and methods for the ultimate tracking solution - Aarki Beat.
        *
        *
        * */

        TRACK_IMMEDIATELY: 1,
        TRACK_QUEUE: 2,

        GET_URL_MAX_LENGTH: 8192,

        /*
        * Initialize tracking object.
        *
        * useEventQueue - boolean parameter, which sets whether to use or not a buffer queue for tracking
        * queueInterval - interval in milliseconds. The buffer queue will be run every `queueInterval` seconds
        *
        * */
        init: function(trackURL, useEventQueue, queueInterval, usePixelforTracking, trackBulkURL) {
            this.trackURL = typeof trackURL !== "undefined" ? trackURL : "http://example.com/api/";
            this.trackBulkURL = typeof trackBulkURL !== "undefined" ? trackBulkURL : "http://example.com/api/bulk/";
            this.useEventQueue = typeof useEventQueue !== "undefined" ? useEventQueue : false;
            usePixelforTracking = typeof usePixelforTracking !== "undefined" ? usePixelforTracking == true : true;
            this.trackingMethod = usePixelforTracking ? this.trackPixel : this.trackJSONP;
            queueInterval = typeof queueInterval !== "undefined" ? queueInterval : 1000;

            this._queuedEvents = [];
            this._expectedEvents = {};
            this.defaultTrack = this.TRACK_IMMEDIATELY; // track immediately

            if (this.useEventQueue){
                var thisVar = this;
                setInterval(function() {
                    thisVar.runQueue();
                }, queueInterval);
            }
        },

        /*
        * Add an event.
        *
        * name - the unique name of the event
        * urlParams - an associative array of parameters to be passed in case event is tracked
        * track - indicates whether to track the event or not. `TRACK_IMMEDIATELY` - track immediately,
        *   `TRACK_QUEUE` - enqueue, any other value - don't track
        * callback - callback function to be called after tracking is complete
        * waitForEvent - unique name of event. This event will be fired only when `waitForEvent` event is added.
        * url - OPTIONAL: custom url for tracking the event
        *
        * */
        addEvent: function(name, urlParams, track, callback, waitForEvent, url) {
            if(typeof name === "undefined"){
                return;
            }

            urlParams = typeof urlParams !== "undefined" ? urlParams : {};
            if (!('event' in urlParams)) {
                urlParams['event'] = name;
            }
            track = typeof track !== "undefined" ? track : this.defaultTrack;
            callback = typeof callback !== "undefined" ? callback : null;
            waitForEvent = typeof waitForEvent !== "undefined" ? waitForEvent : null;
            url = typeof url !== "undefined" ? url : {};

            // Check if there are events which are waiting for current event
            if (name in this._expectedEvents) {
                var waiting_events = this._expectedEvents[name];
                // Empty the slot to avoid adding events twice
                this._expectedEvents[name] = [];
                // Add each event again, but without waiting.
                for(var i=0; i<waiting_events.length; i++){
                    this.addEvent(waiting_events[i]['name'], waiting_events[i]['urlParams'],
                        waiting_events[i]['track'], waiting_events[i]['callback']);
                }
            }

            var event = {
                'name': name,
                'urlParams': urlParams,
                'track': track,
                'callback': callback,
                'url': url
            };

            if (waitForEvent){
                if (!(waitForEvent in this._expectedEvents)) {
                    this._expectedEvents[waitForEvent] = [];
                }
                this._expectedEvents[waitForEvent].push(event);

            }else{
                if (track == this.TRACK_IMMEDIATELY || (track == this.TRACK_QUEUE && !this.useEventQueue)) {
                    this.trackEvent(name, urlParams, callback);
                } else if (track == this.TRACK_QUEUE && this.useEventQueue) {
                    this._queuedEvents.push(event);
                }
            }
        },

        /*
        * Returns the safely url-encoded key=value string representation of `event` object,
        *   which has the following properties: `name`, `urlParams`, `callback`.
        *
        * Return Value - string. "`event.name`<random>=base64("param1=value1&param2=value2..")"
        * Example return value. "ev1_9543=cGFyYW0xPXZhbHVlMQ"
        *
        * */
        encodeEvent: function(event) {
            var eventParams = typeof event.urlParams !== "undefined" ? event.urlParams : {};
            var eventName = event.name + "_" + (Math.random() + '').replace('.', '');

            var urlParams = {};
            urlParams[eventName] = Base64.url_safe_encode(JSON.stringify(eventParams));
            return this.stringifyURLParams(urlParams);
        },

        /*
        * Track the events stored in buffer queue.
        *
        * */
        runQueue: function() {
            if (!this.trackBulkURL) {
                return;
            }

            var queued_events = this._queuedEvents;
            if (!queued_events || queued_events.length == 0){
                return;
            }

            // Empty the array to avoid adding events twice
            this._queuedEvents = [];

            var url = this.trackBulkURL,
                callbacks = [],
                putInQueue = [],
                newURL,
                evt_i;

            for (evt_i=0; evt_i<queued_events.length; evt_i++) {
                newURL = url + (url.indexOf("?") != -1 ? "&" : "?") + this.encodeEvent(queued_events[evt_i]);
                if (newURL.length > this.GET_URL_MAX_LENGTH) {
                    break;
                }

                callbacks.push(queued_events[evt_i]['callback']);
                url = newURL;
            }

            // Case 1) no event was added to url. In this case, track the first event, and put the rest back to queue.
            if (evt_i == 0) {
                var evt = queued_events[evt_i];
                this.trackEvent(evt['name'], evt['urlParams'], evt['callback']);
                putInQueue = queued_events.slice(evt_i + 1);
            }
            // Case 2) not all the events were added to url. Track added events in bulk, and put the rest back to queue.
            else {
                this.trackingMethod(url);
                for(var i=0; i<callbacks.length; i++){
                    if (callbacks[i]) callbacks[i]();
                }
                putInQueue = queued_events.slice(evt_i);
            }

            // Put remaining events in the beginning of queue.
            if (putInQueue.length > 0) {
                this._queuedEvents = putInQueue.concat(this._queuedEvents);
            }
        },

        /*
        * Convert associative array of URL parameters into a string, which looks like "param1=value1&param2=value2"
        *
        * */
        stringifyURLParams: function(urlParams) {
            var strParams = [];
            for (var param in urlParams) {
                if (urlParams.hasOwnProperty(param)) {
                    strParams.push(encodeURIComponent(param) + "=" + encodeURIComponent(urlParams[param]));
                }
            }
            return strParams.join("&");
        },

        /*
        * Track an event. Override this method to track in custom way.
        *
        * name - the unique name of the event
        * urlParams - an associative array of parameters to be passed in case event is tracked
        * callback - callback function to be called after tracking is complete
        *
        * */
        trackEvent: function(name, urlParams, callback) {
            if (typeof name === "undefined" || !this.trackURL) {
                if (callback) callback();
                return null;
            }

            urlParams = typeof urlParams !== "undefined" ? urlParams : {};
            var strParams = this.stringifyURLParams(urlParams);
            var url = this.trackURL + (this.trackURL.indexOf("?") != -1 ? "&" : "?") + strParams;

            return this.trackingMethod(url, callback);
        },

        /*
        * Send a get cross domain request by using a pixel.
        *
        * name - the unique name of the event
        * urlParams - an associative array of parameters to be passed in case event is tracked
        * callback - callback function to be called after tracking is complete
        *
        * */
        trackPixel: function(url, callback) {
            if (!url) {
                if (callback) callback();
                return null;
            }

            // Set up a pixel which tracks the event
            var el = document.createElement('IMG');
            el.style.width = '1px';
            el.style.height = '1px';
            if (callback) el.onload = callback;
            el.src = url;

            return null;
        },

        /*
        * Send a get cross domain request by using a jsonp request.
        *
        * name - the unique name of the event
        * urlParams - an associative array of parameters to be passed in case event is tracked
        * callback - callback function to be called after tracking is complete
        *
        * */
        trackJSONP: function (url, callback) {
            var func = 'ms_' + (Math.random() + '').replace('.', '');
            window[func] = function (data) {
                delete window[func];
                if (callback) callback(data);
            };
            var tag = document.createElement('script');
            tag.onload = function () {};
            tag.onerror = function () {
                if (callback) callback(new Error('could not load script'));
            };
            tag.src = url + ( url.indexOf('?') < 0 ? '?' : '&' ) + 'callback=' + func;
            document.body.appendChild(tag);

            return null;
        }
    };

    wnd.beat = new BeatConstruct();

})(window);
