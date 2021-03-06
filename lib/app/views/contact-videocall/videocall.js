/*

This file is part of Streembit application. 
Streembit is an open source communication application. 

Streembit is a free software: you can redistribute it and/or modify it under the terms of the GNU General Public License 
as published by the Free Software Foundation, either version 3.0 of the License, or (at your option) any later version.

Streembit is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty 
of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with Streembit software.  
If not, see http://www.gnu.org/licenses/.
 
-------------------------------------------------------------------------------------------------------------------------
Author: Tibor Zsolt Pardi 
Copyright (C) Streembit 2017
-------------------------------------------------------------------------------------------------------------------------

*/


(function () {
    define(
        [
            'appevents', 'contactlist', 'peercomm', 'appsrvc', 'definitions', 'utilities',
            'webrtccall', 'uuid', 'connections', 'filesender', 'errhandler', 'errcodes', './videocall.html!text'],
        function (
            appevents, contactlist, peercomm, appsrvc, defs, utilities, webrtccall, uuid, connections, filesender, errhandler, errcodes, template) {

            function resize_video_controls() {
                var vh = $('.remotevid_parent').height();
                var h = vh - 10;
                var w = parseInt(h * 1.3333);
                var video = $("#remotevid");
                $(video).width(w);
            }

            function onRemoteVidConn() {
                resize_video_controls();
                var local_video = document.getElementById("localvid");
                local_video.muted = true; // !important, without this the sound will be echoing
            }

            function onWindowResize() {
                resize_video_controls();
            }

            function showChatControl() {
                // show the chat window
                var chatContainer = $(".video_chat_items");
                $(chatContainer).css({
                    flex: '1 1 70%',
                    display: 'flex',
                });
                $('.video_ctrls_items').addClass('hide-content-mobile');
                if($('#smallScreenVideoCall1').hasClass('active')) {
                    var smVideo = $("#smallScreenVideoCall1 .remotevid").detach();
                    var callTime = $("#smallScreenVideoCall1 .call-time").detach();
                    $(".call-with .call-time").remove();
                    $(".call-with").append(callTime);
                    $(".remotevid_parent .remotevid").remove();
                    $(".remotevid_parent").append(smVideo);
                    $('#remotevid').get(0).play();
                    $('#smallScreenVideoCall1').removeClass('active');
                }
                resize_video_controls();
            }

            function VideoCallVM(params) {
                var viewModel = {
                    localVideo: "localvid",
                    remoteVideo: "remotevid",
                    contact: params.contact,
                    contact_name: ko.observable(params.contact.name),
                    contact_avatar: ko.observable(params.contact.avatar),
                    iscaller: params.iscaller,
                    calltype: params.calltype,
                    peerhangup: false,
                    calltime: ko.observable(0),
                    call_timer_obj: null,
                    videoConnCallback: 0,
                    showChatCallback: 0,
                    chatitems: ko.observableArray([]),
                    chatmsg: ko.observable(''),
                    ischatdisplay: false,
                    isvideo: ko.observable(true),
                    isaudio: ko.observable(true),
                    make_connection_inprogress: false,
                    webrtcconn: 0,
                    contact_is_typing: ko.observable(''),
                    issession: ko.observable(params.issession),

                    isContactWithAva: function(sender) {
                        return sender !== appsrvc.username && this.contact_avatar;
                    },

                    dispose: function () {
                        // try {
                        //     webrtccall.hangup();
                        //     if (!viewModel.peerhangup) {
                        //         peercomm.hangup_call(viewModel.contact);
                        //     }
                        //     if (viewModel.call_timer_obj) {
                        //         clearTimeout(viewModel.call_timer_obj);
                        //     }

                            // appevents.removeSignal("on-remotestream-connect", viewModel.onRemoteStreamConnect);
                            // appevents.removeSignal("oncontactevent", viewModel.onTextMessage);
                            // appevents.removeSignal("on-cmd-hangup-call", viewModel.onPeerHangup);
                        // }
                        // catch (err) {
                        //     // streembit.notify.error("VideoCallVM dispose %j", err, true);
                        //     streembit.notify.error(errhandler.getmsg(errcodes.UI_VIDEOCALLVM_DISPOSE, err, true));
                        // }
                    },

                    init: function () {

                        $('.chat-fill-area').css({ height: ($('.content-panel').height() - 260) });
                        $(function () {
                            $(window).on('resize', function () {
                                $('.chat-fill-area').css({ "height": "auto" });
                                var panelHeight = $('.content-panel').height();
                                $('.chat-fill-area').css({ height: (panelHeight - 260) });
                                // $('.media-call-content').css({ "min-height": panelHeight, 'margin-top': "16px" });
                            })
                        });
                        //
                        appevents.addListener("on-remotestream-connect", viewModel.onRemoteStreamConnect);
                        appevents.addListener("on-cmd-hangup-call", viewModel.onPeerHangup);
                        appevents.addListener("oncontactevent", viewModel.onTextMessage);
                        appevents.addListener("ontyping", viewModel.onContactTyping);

                        var options = {
                            contact: this.contact,
                            iscaller: this.iscaller,
                            calltype: this.calltype
                        };
                        webrtccall.initcall(viewModel.localVideo, viewModel.remoteVideo, options);                        
                        // add window resize event handler
                        $(window).resize(onWindowResize).resize();

                        $("#txtChatCtrl").keyup(function (e) {
                            var code = e.which;
                            if (code == 13) {
                                e.preventDefault();
                                var text = $.trim($("#txtChatCtrl").val());
                                if (text) {
                                    viewModel.chatmsg(text);
                                    viewModel.sendchat();
                                }
                            }
                        });

                        //  set the selected contact to have the correct contact in case 
                        //  the view was initiated by the peercomm object
                        appevents.dispatch("oncontactevent", "on-selected-contact-change", this.contact.name);

                        $('.video_ctrls_items').removeClass('hide-content-mobile');

                    },

                    onContactTyping: function() {
                        viewModel.contact_is_typing(viewModel.contact_name() + " " + "is typing...");
                    },

                    typing: function() {
                        try {
                            if (!peercomm.is_peer_session(viewModel.contact.name)) {
                                // return streembit.notify.error("Unable to send data. No session exists with the contact");
                                return streembit.notify.error(errhandler.getmsg(errcodes.UI_UNABLE_SEND_DATA));
                            }
                            var message = { cmd: defs.PEERMSG_TYPING, sender: appsrvc.username};
                            var contact = contactlist.get_contact(this.contact.name);
                            var peermsg = peercomm.get_peer_message(contact, message);

                            if (!viewModel.webrtcconn) {
                                viewModel.webrtcconn = connections.get(this.contact.name);
                            }
                            viewModel.webrtcconn.send(peermsg);
                        }
                        catch (err) {
                            // streembit.notify.error("Send chat error %j", err);
                            streembit.notify.error(errhandler.getmsg(errcodes.UI_SEND_CHAT_ERROR, err));
                        }
                    },

                    onPeerHangup: function () {
                        viewModel.peerhangup = true;
                        webrtccall.hangup();
                        window.callData = null;
                        // navigate to the contact screen
                        appevents.dispatch("on-contact-selected", viewModel.contact);
                        streembit.notify.info("The call has been terminated by the contact", null, true);
                        streembit.notify.info("Call Terminated");
                        if(!$('#smallScreenVideoCall1').hasClass('active')) {
                        appevents.navigate('dashboard');
                        } else {
                            $('#smallScreenVideoCall1 .remotevid').remove();
                            $('#smallScreenVideoCall1 .call-time').remove();
                            $('#smallScreenVideoCall1').removeClass('active');
                        }
                        appevents.dispatch("on-contact-selected", viewModel.contact);
                        appevents.removeSignal("on-remotestream-connect", viewModel.onRemoteStreamConnect);
                        appevents.removeSignal("on-cmd-hangup-call", viewModel.onPeerHangup);
                        appevents.removeSignal("oncontactevent", viewModel.onTextMessage);
                    },

                    toHHMMSS: function (value) {
                        var seconds = Math.floor(value),
                            hours = Math.floor(seconds / 3600);
                        seconds -= hours * 3600;
                        var minutes = Math.floor(seconds / 60);
                        seconds -= minutes * 60;

                        if (hours < 10) { hours = "0" + hours; }
                        if (minutes < 10) { minutes = "0" + minutes; }
                        if (seconds < 10) { seconds = "0" + seconds; }
                        return hours + ':' + minutes + ':' + seconds;
                    },

                    calltimeproc: function () {
                        var value = 0;
                        viewModel.call_timer_obj = setInterval(function () {
                            value++;
                            var txt = viewModel.toHHMMSS(value);
                            viewModel.calltime(txt);
                        }, 1000);
                    },

                    onRemoteStreamConnect: function () {
                        console.log("VideoCallVM viewmodel onRemoteStreamConnect");
                        onRemoteVidConn();
                        viewModel.calltimeproc();
                    },

                    sendfile: function () {
                        if (!peercomm.is_peer_session(viewModel.contact.name)) {
                            // return streembit.notify.error("Invalid contact session");
                            return streembit.notify.error(errhandler.getmsg(errcodes.UI_INVALID_CONTACT_SESSION));
                        }

                        try {
                            var filetask = new filesender();
                            filetask.run(this.contact);
                        }
                        catch (err) {
                            // streembit.notify.error("Send file error: %j", err);
                            streembit.notify.error(errhandler.getmsg(errcodes.UI_SEND_FILE_ERROR, err));
                        }
                    },

                    showchat: function () {
                        var taskTimer, taskid;
                        try {
                            if(!connections.connected(viewModel.contact.name)) {
                                if (viewModel.make_connection_inprogress == true) {
                                    return streembit.notify.info("Please wait ... making a connection is in progress.", null, true);
                                }
                                var created = false, reported = false;
                                viewModel.make_connection_inprogress = true;
                                taskid = uuid.v1();
                                connections.create(viewModel.contact, true, taskid, function (err, webrtcconn) {
                                    viewModel.make_connection_inprogress = false;
                                    appevents.dispatch("on-task-event", "close", "send", taskid);
                                    clearTimeout(taskTimer);
                                    if (err) {
                                        reported = true;
                                        // return streembit.notify.error("Error in starting chat: %j", err, true);
                                        return streembit.notify.error(errhandler.getmsg(errcodes.UI_STARTING_CHAT, err, true));
                                    }
                                    if (!webrtcconn) {
                                        reported = true;
                                        // return streembit.notify.error("Error in starting chat, no WebRTC connection", null, true);
                                        return streembit.notify.error(errhandler.getmsg(errcodes.UI_STARTING_CHAT_NO_WEBRTC_CONN, null, true));
                                    }
                                    viewModel.webrtcconn = webrtcconn;
                                    showChatControl();
                                });

                                taskTimer = setTimeout(function () {
                                    if (!created && !reported) {
                                        //viewModel.unblockwait();
                                        // streembit.notify.error("Error in starting chat: no reply from the contact", null, true);
                                        streembit.notify.error(errhandler.getmsg(errcodes.UI_CHAT_REPLY_FROM_CONTACT, null, true));
                                        viewModel.make_connection_inprogress = false;
                                        appevents.dispatch("on-task-event", "close", "send", taskid);
                                    }
                                }, 35000);
                            } else {
                                showChatControl();
                            }
                        }
                        catch (err) {
                            viewModel.make_connection_inprogress = false;
                            appevents.dispatch("on-task-event", "close", "send", taskid);
                            clearTimeout(taskTimer);
                            // streembit.notify.error("Start chat error: %j", err);
                            streembit.notify.error(errhandler.getmsg(errcodes.UI_START_CHAT_ERROR, err));
                        }                       
                    },

                    add_video: function () {
                        webrtccall.show_video(function () {
                            viewModel.isvideo(true);
                            // TODO send to the peer
                        });
                    },

                    remove_video: function () {
                        webrtccall.hide_video(function () {
                            viewModel.isvideo(false);
                            // TODO send to the peer
                        });
                    },

                    add_audio: function () {
                        webrtccall.toggle_audio(true, function () {
                            viewModel.isaudio(true);
                            // TODO send to the peer
                        });
                    },

                    remove_audio: function () {
                        webrtccall.toggle_audio(false, function () {
                            viewModel.isaudio(false);
                            // TODO send to the peer
                        });
                    },

                    hangup: function () {
                        webrtccall.hangup();
                        window.callData = null;
                        peercomm.hangup_call(viewModel.contact);
                        appevents.navigate('dashboard');
                        // navigate to empty screen
                        appevents.dispatch("on-contact-selected", viewModel.contact);

                        if (viewModel.call_timer_obj) {
                            clearTimeout(viewModel.call_timer_obj);
                        }
                        $('#smallScreenVideoCall1 .remotevid').remove();
                        $('#smallScreenVideoCall1 .call-time').remove();
                        $('#smallScreenVideoCall1').removeClass('active');
                        appevents.removeSignal("on-remotestream-connect", viewModel.onRemoteStreamConnect);
                        appevents.removeSignal("on-cmd-hangup-call", viewModel.onPeerHangup);
                        appevents.removeSignal("oncontactevent", viewModel.onTextMessage);
                    },

                    sendchat: function () {
                        try {
                            var msg = $.trim(this.chatmsg());
                            if (!msg) { return }

                            if (!viewModel.webrtcconn) {
                                viewModel.webrtcconn = connections.get(this.contact.name);
                            }

                            if (!viewModel.webrtcconn) {
                                // throw new Error("invalid WebRTC data connection")
                                throw new Error(errhandler.getmsg(errcodes.UI_INVALID_WEBRTC_DATA_CONN))
                            }

                            var message = { cmd: defs.PEERMSG_TXTMSG, sender: appsrvc.username, text: msg };
                            var contact = contactlist.get_contact(this.contact.name);
                            var peermsg = peercomm.get_peer_message(contact, message);
                            viewModel.webrtcconn.send(peermsg);

                            //  update the list with the sent message
                            message.time = utilities.timeNow();
                            this.addTextMessage(message);
                            appsrvc.add_textmsg(viewModel.contact.name, message);
                            this.chatmsg('');
                        }
                        catch (err) {
                            // streembit.notify.error("Send chat error %j", err, true);
                            streembit.notify.error(errhandler.getmsg(errcodes.UI_SEND_CHAT_ERROR, err, true));
                        }
                    },

                    addTextMessage: function (msg) {
                        viewModel.chatitems.push(msg);
                        var $cont = $('.chatitemswnd');
                        $cont[0].scrollTop = $cont[0].scrollHeight;
                    },

                    onTextMessage: function (event, msg) {
                        if (event == "on-text-message") {
                            if (viewModel.ischatdisplay == false) {
                                showChatControl();
                                viewModel.ischatdisplay = true;
                            }
                            viewModel.addTextMessage(msg);
                        }
                    }

                };

                viewModel.init();
                return viewModel;
            }

            return {
                viewModel: VideoCallVM,
                template: template
            };
        }
    ); // define end
}());