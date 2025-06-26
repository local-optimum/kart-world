# Kart World - Enhanced 3D Web Experience

> **🚗 This is a specialized fork focused on kart racing gameplay improvements**
>
> This repository is based on the excellent [MML 3D Web Experience](https://github.com/mml-io/3d-web-experience) project by MML.io. 
> 
> **✨ Enhanced Features Added:**
> - Advanced kart physics with realistic drift mechanics
> - Improved camera system with dynamic tracking
> - Steering and movement polish for racing gameplay
> - Smoke trails and visual effects
> - Optimized controls for high-speed racing
>
> **👉 For the original project and latest updates, visit:** https://github.com/mml-io/3d-web-experience
>
> **🙏 Full credit to the MML.io team** for creating this amazing foundation for 3D web experiences.

## 🎮 Live Demo

**Try the live demo:** [https://kart-world-production.up.railway.app/](https://kart-world-production.up.railway.app/)

Experience the enhanced kart racing gameplay directly in your browser - no downloads required!

---

# (MML) 3D Web Experience

This repository contains packages used to run a web-based, multi-user 3D web experience that
supports [MML (Metaverse Markup Language)](https://mml.io/). 

It can be easily deployed to environments that support Node.js and can expose ports to the internet.

<img src="./playground.jpg">

## Packages

This repository includes the following published packages:

- [`@mml-io/3d-web-experience-client`](./packages/3d-web-experience-client)
  - Client for a 3D web experience that includes user position networking, MML content composition, 
    MML-based avatars, and text chat.
- [`@mml-io/3d-web-experience-server`](./packages/3d-web-experience-server)
  - Server for a 3D web experience that includes user position networking, MML hosting, and text chat.
- [`@mml-io/3d-web-client-core`](./packages/3d-web-client-core)
  - The main components of a 3D web experience (controls, rendering, MML composition etc.) that can be 
    extended with other packages to create a full 3D web experience.
- [`@mml-io/3d-web-user-networking`](./packages/3d-web-user-networking)
  - WebSocket server and client implementations that synchronize user positions.
- [`@mml-io/3d-web-avatar`](./packages/3d-web-avatar)
  - Creates and parses MML documents for avatars (using `m-character`).
- [`@mml-io/3d-web-avatar-editor-ui`](./packages/3d-web-avatar-editor-ui)
  - UI components (e.g. parts pickers) for creating avatars.
- [`@mml-io/3d-web-standalone-avatar-editor`](./packages/3d-web-standalone-avatar-editor)
  - An MML avatar editor (using `m-character`).
- [`@mml-io/3d-web-text-chat`](./packages/3d-web-text-chat)
  - Contains WebSocket server and client implementations for text chat.
- [`@mml-io/3d-web-voice-chat`](./packages/3d-web-voice-chat)
  - Client implementation for spatial voice chat.

## Main features

- Multiple users can connect to the experience using just a web browser.
- Users can interact simultaneously with the stateful MML documents.
- Easy to deploy and extend with interactive MML content.

## 🌳 Interactive Racing Environment Features

The kart racing experience showcases advanced MML (Metaverse Markup Language) functionality through an interactive environmental system:

### MML Capabilities Demonstrated

**Collision Detection & Interaction**
- Position probes for range-based collision detection
- Interactive objects that respond to player proximity
- State management for object interactions and respawning

**Spatial Audio System**
- Positional 3D audio that follows player movement
- Dynamic audio element creation and cleanup
- Multiple audio layers (engine sounds, environmental effects, background music)

**Real-time Visual Effects**
- Dynamic label creation and positioning
- Smooth position interpolation and animations
- Multi-user visual element management

**Multiplayer State Synchronization**
- Player tracking across large areas
- Automatic connection/disconnection handling
- Persistent object states shared across all users

This demonstrates MML's power for creating rich, interactive multiplayer experiences with real-time state management, spatial audio, and dynamic content generation.

### Auth Flow
- When the client page is rendered by the server, the server uses a UserAuthenticator implementation to determine if a session should be generated for the incoming http request and if so includes that session token on the client page.
- The client then sends the session token in the first message to the server when it connects via websocket.
- The server can use the session token to authenticate the user and determine what identity (username, avatar etc) the user should have.
- An example implementation of this is provided in the example server, but the interface is extensible enough that a more complex user authenticator can limit which avatar components should be permitted based on external systems.


## Running Examples & Iterating Locally

Making sure you have Node.js installed, run the following from the root of the repository:

```bash
npm install
npm run iterate
```

## Examples
 
- [`example/multi-user-3d-web-experience`](./example/multi-user-3d-web-experience)
  - Once the server is running (see [above](#running-examples--iterating-locally)), open `http://localhost:8080`.
  - A client and server pair of packages that uses the `@mml-io/3d-web-experience-client` and `@mml-io/3d-web-experience-server` packages to create a multi-user 3d web experience that includes MML hosting and text chat.
- [`example/local-only-multi-user-3d-web-experience`](./example/local-only-multi-user-3d-web-experience)
  - Once the server is running (see [above](#running-examples--iterating-locally)), open `http://localhost:8081`.
  - A client that uses the various packages to create a 3d web experience that only works locally. No server is needed, but there is a server to serve the client.
- [`example/web-avatar-editor`](./example/web-avatar-editor)
  - Once the server is running (see [above](#running-examples--iterating-locally)), open `http://localhost:8082`.
  - An avatar editor that uses the `@mml-io/3d-web-standalone-avatar-editor` to create and edit MML avatars and a simple Express server that hosts the editor.

## Credits & Attribution

This project uses the following third-party assets under their respective licenses:

### 3D Models
- **Go Kart** by [Samuel Thomas](https://sketchfab.com/Samuel_Thomas)  
  Licensed under [CC Attribution](https://creativecommons.org/licenses/by/4.0/)  
  Source: https://sketchfab.com/3d-models/go-kart-2338810f0b1e444bace9bd7796b8c9e4

- **NFS Drift Map** by [Tirarex](https://sketchfab.com/Tirarex)  
  Licensed under [CC Attribution](https://creativecommons.org/licenses/by/4.0/)  
  Source: https://sketchfab.com/3d-models/nfs-drift-95509e22511e412eb715a4c108d1fc76

- **Stylized Tree 03 Clean** by [Clayton Creative](https://sketchfab.com/claytoncreative)  
  Licensed under [CC Attribution](https://creativecommons.org/licenses/by/4.0/)  
  Source: https://sketchfab.com/3d-models/stylized-tree-03-clean-d3af590a640b40ca98c2d669e83182e8

- **Rooftop Night HDRI** by [Greg Zaal](https://gregzaal.com/)  
  Licensed under [CC0 (Public Domain)](https://creativecommons.org/publicdomain/zero/1.0/)  
  Source: https://polyhaven.com/a/rooftop_night

### Audio Assets
- **Ferrari Enzo Sound Effect** by [AstonMartinVantageV12](https://pixabay.com/users/astonmartinvantagev12-33416013/)  
  Licensed as Free for Use  
  Source: https://pixabay.com/sound-effects/ferrari-enzo-sound-effect-360529/

- **New Roads Music** by [Vineemusic](https://pixabay.com/users/vineethkumar-28582768/)  
  Licensed as Free for Use  
  Source: https://pixabay.com/music/dance-new-roads-129667/

---

### License Information
- **CC Attribution (CC BY)**: You are free to use, share, and adapt these works for any purpose, even commercially, as long as you provide appropriate credit to the original creator.
- **CC0 (Public Domain)**: No rights reserved. You can use, modify, and distribute these works for any purpose without restriction or attribution required.
- **Free for Use**: These assets can be used freely without restriction.
