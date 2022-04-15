Demo at https://diekmann.github.io/oertchan/

# About örtchan

Örtchan started out as a WebRTC demo (hence the name ö**RTC**han) and 💩coding fun project.
It is an overlay peer to peer network, built on top of [RTCDataChannel](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel) (hence the name ört**chan**).

## Runtime Architecture

Örtchan mostly runs in your browser. It can be served from a static webserver (such as github pages, see demo link above) or even local `file://` URLs without the need for a webserver at all.
To connect clients to the peer to peer network from their browser, a small signalling server (written in Golang) is required.
This signalling server only helps to establish peer to peer connections.
Once peer to peer connections are established, everything is peer to peer.
Besides initial signalling, the server does not see or handle any traffic.
The server is designed to be able to run on a potato.
Currently, it runs as a free heroku app.

Thanks to middleboxes breaking the Internet, it is sometimes hard to establish real p2p connections.
Open [STUN](https://en.wikipedia.org/wiki/STUN) and [TURN](https://en.wikipedia.org/wiki/Traversal_Using_Relays_around_NAT) servers are helping to establish connections.
If your connectivity is too fucked up and too deeply nat'ed (👋 mobile Internet), a random open TURN server I found on the open interwebs will be relaying all your traffic (and hence be able to intercept it).
It's the age of open relays again!

Except for the signalling to provide initial connectivity to the network, everything runs in the browser. Even the Örtchan servers (!!!).

This implements the software architecture design pattern of parasitism: run everything on someone else's open infrastructure. Also known as the ☁️-without-💳 architecture.


## Design Principles

### Identities

When opening örtchan, a new unique asymetric key pair is created.
The hash of the public key is your globally unique user id.
The user id should provide strong pseudonymity (nobody is able to impersonate your user id).
Since this does not read very user friendly, a user-chosen display name is also available.
This display name is neither globally unique nor a secure identifier.
A local client will try its best to make sure display names are at least locally unique.

### Privacy

Lol, read the Runtime Architecture section again.

### Anonymity

When connecting via webRTC p2p connections, you are leaking your IP address to all peers and posting it to some open sinalling server.
Your IP address is also easily linkable to your pseudonymous user identity.
In other words: nope! No anonymity.

Yet, plausible deniability and anonymity may be implemented on top of örtchan.
For example, the anonrelay server relays messages, obscuring the original sender.
Just like TOR, except this is only a tech demo and less secure and without any protections against common attacks against p2p systems (e.g., eclipse attack is trivial).

## Running örtchan servers

Just go to the servers/ folder and open the html page.
Yes, it's that simple!
Check out the source code.
It is literally that simple!

Running a server in the browser? Yes!
Is this a good idea? Well, ...

## Architecture

### Scalabilty

With *n* clients, we need *O(n²)* connections.
This is quite shit from a global point of view.

Or phrasing it more neoliberally: With each client scaling linearly with the number of its peer connections, we enable each client to succeed up to its full potential.
🤮

### Proof of Work

No, go away!

### Proof of Stake

Lol, no!

### web3

Sharing is caring!

### Limitations

The only limitations are in your browser.

## Contributing

No `npm`, no bloat, no external libraries unless vendored and you will be responsible for them.
This is a thin tech demo. No extensive wrappers or build toolchains. Nothing which prevents running everything locally from `file://` URLs and a tiny `go run` for the signalling server.