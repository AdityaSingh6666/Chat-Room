import express from "express";
import { Server } from "socket.io"
import path from 'path'
import { fileURLToPath } from 'url'
import { get } from "http";

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = process.env.PORT || 3500 
const ADMIN = "Admin"

const app = express()

app.use(express.static(path.join(__dirname, "public")))

const expressServer = app.listen(PORT,() =>{
    console.log(`Server is running on port ${PORT}`);
})

const UsersState = {
    users: [],
    setUsers: function (newUsersArray) {
        this.users = newUsersArray;
    }
}

const io = new Server(expressServer, {
    cors: {
        origin: process.env.NODE_ENV === "production" ? false : ["http://localhost:5500","http://127.0.0.1:5500"]
    }
})    

io.on('connection', socket => {
    console.log(`User ${socket.id} connected`);

    // Upon Connection - only to the user
    socket.emit('message', buildMessage(ADMIN, "Welcome to the Chat App !!"));

    socket.on('enterRoom', ({ name, room }) => {

        //leave previous room
        const prevRoom = getUser(socket.id)?.room

        if (prevRoom) { 
            socket.leave(prevRoom);
            io.to(prevRoom).emit('message', buildMessage(ADMIN, `${name} has left the chat`));
        }
        // Activate user
        const user = activateUser(socket.id, name, room);
        
        //Cannot update previous room's users list until after the state update in activate user
        if (prevRoom) {
            io.to(prevRoom).emit('userList', {
                users: getUsersInRoom(prevRoom)
            })
        }

        // Join the room
        socket.join(user.room);

        // Notify the user
        socket.emit('message', buildMessage(ADMIN, `Welcome to ${user.room} chat room`));

        // Notify all users in the room about the new user
        socket.broadcast.to(user.room).emit('message', buildMessage(ADMIN, `${user.name} has joined the room`));

        // Update users list in the room
        io.to(user.room).emit('usersList',{
            users: getUsersInRoom(user.room)
        })
        
        // Update rooms list
        io.emit('roomList', {
            rooms: getAllActiveRooms()
        })
    })

    socket.on('disconnect',() => {
        const user = getUser(socket.id);
        userLeavesApp(socket.id)

        if (user) {
            io.to(user.room).emit('message', buildMessage(ADMIN, `${user.name} has left the chat`));
            // Update users list in the room
            io.to(user.room).emit('userList', {
                users: getUsersInRoom(user.room)
            });

            io.emit('roomList', {
                rooms: getAllActiveRooms()
            })

            console.log(`User ${socket.id} disconnected`);
        }
    });
    
    //Listening for a message event
    socket.on('message', ({ name, text }) => {
        const room = getUser(socket.id)?.room;
        if (room) {
            io.to(room).emit('message',buildMessage(name,text));
        }
    })

    socket.on('activity' , (name) => {
        const room = getUser(socket.id)?.room;
        if (room) {
            socket.broadcast.to(room).emit('activity', name);
        }
    })
})

function buildMessage(name,text) {
    return {
        name,
        text,
        timestamp: new Date().toISOString()
    }
}

// User functions
function activateUser(id, name, room) {
    const user = { id, name, room };
    UsersState.setUsers([
        ...UsersState.users.filter(user => user.id !== id), 
        user
    ])
    return user
}

function userLeavesApp(id) {
    UsersState.setUsers(
        UsersState.users.filter(user => user.id !== id)
    )
}

function getUser(id) {
    return UsersState.users.find(user => user.id === id);
}

function getUsersInRoom(room) {
    return UsersState.users.filter(user => user.room === room);
}

function getAllActiveRooms() {
    return Array.from(new Set(UsersState.users.map(user => user.room)));
}
