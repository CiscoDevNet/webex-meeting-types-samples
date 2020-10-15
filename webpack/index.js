import { init as initWebex } from 'webex';

// Declare some globals that we'll need throughout
var webex;

// First, let's wire our form fields up to localStorage so we don't have to
// retype things everytime we reload the page.
[
    'txtAccessToken',
    'txtDialByEmail'
].forEach((id) => {
    const el = document.getElementById(id);

    el.value = localStorage.getItem(id);
    el.addEventListener('change', (event) => {
        localStorage.setItem(id, event.target.value);
    });
});

// There's a few different events that'll let us know we should initialize
// Webex and start listening for incoming calls, so we'll wrap a few things
// up in a function.
function connect() {
    return new Promise((resolve) => {
        pConnectionStatus.innerHTML = 'Connecting...';
        if (!webex) {
            // eslint-disable-next-line no-multi-assign
            webex = window.webex = initWebex({
                config: {
                    meetings: {
                        deviceType: 'WEB'
                    }
                    // Any other sdk config we need
                },
                credentials: {
                    access_token: txtAccessToken.value
                }
            });
        }

        // Listen for added meetings
        webex.meetings.on('meeting:added', (addedMeetingEvent) => {
            if (addedMeetingEvent.type === 'INCOMING') {
                const addedMeeting = addedMeetingEvent.meeting;

                // Acknowledge to the server that we received the call on our device
                addedMeeting.acknowledge(addedMeetingEvent.type)
                    .then(() => {
                        if (confirm('Answer incoming call')) {
                            joinMeeting(addedMeeting);
                            bindMeetingEvents(addedMeeting);
                        }
                        else {
                            addedMeeting.decline();
                        }
                    });
            }
        });

        // Register our device with Webex cloud
        if (!webex.meetings.registered) {
            webex.meetings.register()
                // Sync our meetings with existing meetings on the server
                .then(() => webex.meetings.syncMeetings())
                .then(() => {
                    pConnectionStatus.innerHTML = 'Connected';
                    fsDestination.querySelectorAll('input[type="radio"]').forEach(rb => {
                        rb.disabled = false;
                    })
                    dialByEmail.click();
                    btnDial.disabled = false;
                    // Our device is now connected
                    resolve();
                })
                // This is a terrible way to handle errors, but anything more specific is
                // going to depend a lot on your app
                .catch((err) => {
                    pConnectionStatus.innerHTML = 'Disconnected'
                    alert(err);
                    // we'll rethrow here since we didn't really *handle* the error, we just
                    // reported it
                    //   throw err;
                });
        }
        else {
            // Device was already connected
            resolve();
        }
    });
}

// Similarly, there are a few different ways we'll get a meeting Object, so let's
// put meeting handling inside its own function.
function bindMeetingEvents(meeting) {
    // call is a call instance, not a promise, so to know if things break,
    // we'll need to listen for the error event. Again, this is a rather naive
    // handler.
    meeting.on('error', (err) => {
        console.error(err);
    });

    // Handle media streams changes to ready state
    meeting.on('media:ready', (media) => {
        if (!media) {
            return;
        }
        if (media.type === 'local') {
            selfView.srcObject = media.stream;
            divSelfViewMessage.style.zIndex = 1;
        }
        if (media.type === 'remoteVideo') {
            remoteView.srcObject = media.stream;
        }
        if (media.type === 'remoteAudio') {
            remoteAudio.srcObject = media.stream;
        }
    });

    // Handle media streams stopping
    meeting.on('media:stopped', (media) => {
        // Remove media streams
        if (media.type === 'local') {
            selfView.srcObject = null;
            divSelfViewMessage.style.zIndex = 3;

        }
        if (media.type === 'remoteVideo') {
            remoteView.srcObject = null;
        }
        if (media.type === 'remoteAudio') {
            remoteAudio.srcObject = null;
        }
        cbVideo.checked = false;
        cbAudio.checked = false;
    });

    // Update participant info
    meeting.members.on('members:update', (delta) => {
        const { full: membersData } = delta;
        const memberIDs = Object.keys(membersData);

        memberIDs.forEach((memberID) => {
            const memberObject = membersData[memberID];

            // Devices are listed in the memberships object.
            // We are not concerned with them in this demo
            if (memberObject.isUser) {
                if (memberObject.isSelf) {
                    callStatusLocal.innerHTML = memberObject.status;
                }
                else {
                    callStatusRemote.innerHTML = memberObject.status;
                }
            }
        });
    });

    cbVideo.addEventListener('input', event => {
        if (cbVideo.checked){
            meeting.unmuteVideo();
            divSelfViewMessage.style.zIndex = 1;

        }
        else {
            meeting.muteVideo();
            divSelfViewMessage.style.zIndex = 3;
        }
    });

    cbAudio.addEventListener('input', () => cbAudio.checked ? meeting.unmuteAudio() : meeting.muteAudio());

    // Of course, we'd also like to be able to end the call:
    btnHangup.addEventListener('click', () => {
        meeting.leave();
        btnDial.disabled = false;
        btnHangup.disabled = true;
    });
}

// Join the meeting and add media
function joinMeeting(meeting) {
    // Get constraints

    return meeting.join().then(() => {
        return meeting.getSupportedDevices({
            sendAudio: true,
            sendVideo: true
        })
            .then(({ sendAudio, sendVideo }) => {
                const mediaSettings = {
                    receiveVideo: true,
                    receiveAudio: true,
                    receiveShare: false,
                    sendShare: false,
                    sendVideo,
                    sendAudio
                };
                cbVideo.checked = sendVideo;
                cbAudio.checked = sendAudio;

                return meeting.getMediaStreams(mediaSettings).then((mediaStreams) => {
                    const [localStream, localShare] = mediaStreams;

                    meeting.addMedia({
                        localShare,
                        localStream,
                        mediaSettings
                    });
                });
            });
    });
}

fsDestination.querySelectorAll('input[type="radio"]').forEach(rb => {
    rb.addEventListener('click', event => {
        fsDestination.querySelectorAll('input[type="button"],input[type="text"]').forEach(rb => {
            if (rb.type=='button') rb.disabled = (event.srcElement.parentElement.parentElement != rb.parentElement)
            else rb.disabled = (event.srcElement.parentElement.parentElement != rb.parentElement.parentElement)
        })
    })
});

btnRetrieveInvitee.addEventListener('click', async (event) => {
    let email = txtDialByEmail.value;
    if (email) {
        let people = await webex.people.list({ email: email });
        txtDialByUserId.value = people.items[0].id;
    }
});

btnCreateRoom.addEventListener('click', async (event) => {
    let room = await webex.rooms.create({ title: 'webex-meetings-types-samples' });
    txtDialByRoomId.value = room.id;
    let alertString = 'Created Space: webex-meetings-types-samples';
    if (txtDialByEmail.value) {
        await webex.memberships.create({personEmail: txtDialByEmail.value, roomId: room.id});
        alertString += `\nAdded user: ${txtDialByEmail.value}`;
        alert(alertString);
    }
});

btnCreateMeeting.addEventListener('click', async (event) => {
    let startTime = new Date(Date.now());
    startTime.setTime(startTime.getTime() + (15 * 60 * 1000));
    let endTime = new Date();
    endTime.setTime(startTime.getTime() + (15 * 60 * 1000));
    let guestList = txtDialByEmail.value ? [{email: txtDialByEmail.value}] : null;
    let meetingDetails = JSON.stringify({
        title: 'webex-meeting-types-samples',
        password: 'DevNet123.',
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        enabledAutoRecordMeeting: false,
        allowAnyUserToBeCoHost: false,
        invitees: guestList
    });
    const response = await fetch('https://webexapis.com/v1/meetings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${txtAccessToken.value}`
        },
        body: meetingDetails
    })
    const meeting = await response.json();
    txtDialByMeeting.value = meeting.webLink;
    txtDialBySip.value = meeting.sipAddress;
    let alertString = `Created meeting: webex-meeting-types-samples\nLink: ${meeting.webLink}`;
    if (txtDialByEmail.value) alertString += `\nInvited: ${txtDialByEmail.value}`;
    alert(alertString);
});

btnRetrievePmr.addEventListener('click', async (event) => {
    const pmr = await webex.meetings.personalMeetingRoom.get();
    txtDialByPmr.value = pmr.webExMeetingLink;
})

// Now, let's set up incoming call handling
btnConnect.addEventListener('click', (event) => {
    // The rest of the SDK authorization and registration happens in connect();
    connect();
});

// And finally, let's wire up dialing
btnDial.addEventListener('click', (event) => {

    const destination = fsDestination.querySelector(':checked').parentElement.nextElementSibling.firstElementChild.value;

    btnDial.disabled = true;
    btnHangup.disabled = false;

    // Create the meeting
    return webex.meetings.create(destination).then((meeting) => {
        // Call our helper function for binding events to meetings
        bindMeetingEvents(meeting);

        return joinMeeting(meeting);
    })
    .catch((error) => {
        // Report the error
        console.error(error);
        btnDial.disabled = false;
        btnHangup.disabled = true;
    });
});

// Use enumerateDevices API to check/uncheck and disable checkboxex (if necessary)
// for Audio and Video constraints
window.addEventListener('load', () => {
    // Get elements from the DOM

    // Get access to hardware source of media data
    // For more info about enumerateDevices: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices
    if (navigator && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        navigator.mediaDevices.enumerateDevices()
            .then((devices) => {
                // Check if navigator has audio
                const hasAudio = devices.filter(
                    (device) => device.kind === 'audioinput'
                ).length > 0;

                // Check/uncheck and disable checkbox (if necessary) based on the results from the API
                cbAudio.checked = hasAudio;
                cbAudio.disabled = !hasAudio;

                // Check if navigator has video
                const hasVideo = devices.filter(
                    (device) => device.kind === 'videoinput'
                ).length > 0;

                // Check/uncheck and disable checkbox (if necessary) based on the results from the API
                cbVideo.checked = hasVideo;
                cbVideo.disabled = !hasVideo;
            })
            .catch((error) => {
                // Report the error
                console.error(error);
            });
    }
    else {
        // If there is no media data, automatically uncheck and disable checkboxes
        // for audio and video
        cbAudio.checked = false;
        cbAudio.disabled = true;

        cbVideo.checked = false;
        cbVideo.disabled = true;
    }
});

window.addEventListener('unload', event => {
    if ( webex && webex.meetings.registered) {
        webex.meetings.unregister();
    }
})
