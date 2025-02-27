import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Chat, ChatType, User, UserChat, UserChatPermission, UserChatStatus } from '@prisma/client';
import { UsersService } from 'src/users/users.service';
import { CreateChannelDto, EditChannelDto, JoinChannelDto, memberStatusDto } from './dto/channels.dto';
import { channel } from 'diagnostics_channel';
import * as bcrypt from "bcrypt";

@Injectable()
export class ChannelsService {
    remove: any;
    constructor(
        private prisma: PrismaService, 
        private usersService: UsersService
    ) {}

    async getAllChannels(): Promise<Chat[] | null> {
        const chat = await this.prisma.chat.findMany({
            where: {
                type: { not: ChatType.DIRECT }
            },
        }).catch((err) => {
            return null;
        });
        return chat;       
    }

    async generatePasswd(passwd: string): Promise<string> {
        const salt = await bcrypt.genSaltSync(10);
        const hash = await bcrypt.hash(passwd, salt);
        return hash;
    }

    async getChannelById(chatId: string): Promise<Chat | null> {
        const chat = await this.prisma.chat.findUnique({where: {id: chatId}});
        return chat;
    }

    async getChannelMembers(chatId: string, userId: string): Promise<User[] | null> {
        let chatUser = await this.prisma.userChat.findMany({
            where: {
                chatId: chatId,
                //exclude the user with UserChatPermission.BANNED 
                permission: { not: UserChatPermission.BANNED }
            }
        })

        const flag = chatUser.some((userChat) => userChat.userId === userId);
        if (flag === false) {
            throw new BadRequestException("You are not a member of this channel");
        }

        const users = await this.prisma.user.findMany({
            where: {
                id: { in: chatUser.map((userChat) => userChat.userId)}
            },
        })

        return users;
    }

    async getChannelme(chatId: string, userId: string): Promise<UserChat | null> {
        const chat = await this.prisma.userChat.findFirst({
            where: {
                chatId: chatId,
                userId: userId,
            },
        })
        if (!chat)
            throw new BadRequestException("User is not in the channel");
        return chat;
    }

    async getChannelsByUser(userTofindId: string): Promise<Chat[] | null> {
        let chatUser = await this.prisma.userChat.findMany({
            where: {
                userId: userTofindId
            }
        })
        const chats = await this.prisma.chat.findMany({
            where: {
                id: { in: chatUser.map((userChat) => userChat.chatId)}, 
                type: { not: ChatType.DIRECT},
            },
            include: {
              users: true
            }
        })

        // Get all user ids from the chats
        const userIds = chats.reduce((acc, chat) => {
          chat.users.forEach(user => {
            if (!acc.includes(user.userId)) {
              acc.push(user.userId)
            }
          })
          return acc
        }, [])
    
        // Query users by their ids
        const users = await this.prisma.user.findMany({
          where: {
            id: {
              in: userIds
            }
          }
        })
    
        // Map user details to each chat object
        const result = chats.map(chat => {
          const chatUsers = chat.users.map(chatUser => {
            const user = users.find(u => u.id === chatUser.userId)
            return {
              ...chatUser,
              user
            }
          })
          return {
            ...chat,
            users: chatUsers
          }
        })
    
        return result
    }

    async createChannel(userId: string, settings: CreateChannelDto): Promise<Chat | null> {
        if (!userId) {
            throw new BadRequestException("User not found");
        }
        if (settings.type == ChatType.RESTRICTED && !settings.password) 
            throw new BadRequestException("Password is required for restricted channel");
        let passwd = null;
        if (settings.password)
            passwd = await this.generatePasswd(settings.password);
        
        let channel = await this.prisma.chat.create({
                data: {
                    name: settings.name,
                    type: settings.type,
                    passwd: passwd,
                },
            }).catch((err) => {
                return null;
            });
            await this.prisma.userChat.create({ 
                data: {
                    userId: userId,
                    chatId: channel.id,
                    status: UserChatStatus.OWNER,
                }
            }).catch((err) => {
                return null;
            });
        return channel;      
    }

    async joinChannel(data: JoinChannelDto, userId: string): Promise<Chat | void> {
        const channel = await this.prisma.chat.findUnique({ where: { id: data.chatId } });
        if (!channel)
            throw new BadRequestException("Channel not found");
        const userChannel = await this.prisma.userChat.findMany({ where: { chatId: data.chatId, userId: userId } });
        if (channel.type == ChatType.RESTRICTED) {
            if (await bcrypt.compare(data.passwd, channel.passwd) == false || data.passwd == "")
                throw new BadRequestException("Wrong password");
        }
        const me = await this.prisma.userChat.findFirst({ where: { chatId: data.chatId, userId: userId } });
        if (me && me.permission == UserChatPermission.BANNED)
            throw new BadRequestException("You are banned from this channel");
        if (userChannel.length > 0)
            return channel;

        if (channel.type == ChatType.PRIVATE)
            throw new BadRequestException("Private channel can't be joined");

        const log = await this.prisma.userChat.create({
            data: {
                userId: userId,
                chatId: data.chatId,
                status: UserChatStatus.MEMBER,
            }
        })
        return channel;
    }

    async leaveChannel(chatId: string, userId: string): Promise<Chat | void> {
        const userChannel = await this.prisma.userChat.findFirst({ where: { chatId: chatId, userId: userId } });
        if (!userChannel)
            throw new BadRequestException("User are not in the channel");
        
        if (userChannel.status == UserChatStatus.OWNER){
            const userAdmin = await this.prisma.userChat.findFirst({ where: { chatId: chatId, status: UserChatStatus.ADMIN } });
            if (userAdmin)
                await this.prisma.userChat.update({ where: { id: userAdmin.id }, data: { status: UserChatStatus.OWNER } });
            else {
                const userMember = await this.prisma.userChat.findFirst({ where: { chatId: chatId, status: UserChatStatus.MEMBER } });
                if (userMember)
                    await this.prisma.userChat.update({ where: { id: userMember.id }, data: { status: UserChatStatus.OWNER } });
                else
                    await this.deletechannel(chatId, userId);
            }
        }
        await this.prisma.userChat.deleteMany({ where: { id: userChannel.id } });
        const channelUser = await this.prisma.userChat.findMany({ where: { userId: userId } });
        if (channelUser.length == 0)
            return null;
        const ids = channelUser.map(obj => obj.id);
        const channel = await this.prisma.chat.findMany({ where: { id: { in: ids }, type: { not: ChatType.DIRECT } } });    
        return (channel[0]);
    }
        
    async isPermission(permission: string): Promise <boolean> {
        if (permission == UserChatPermission.MUTED || permission == UserChatPermission.BANNED || permission == UserChatPermission.COMPLIANT || permission == UserChatPermission.KICKED)
            return true;
        return false;
    }

    async memberStatus(userId: string, data: memberStatusDto): Promise <UserChat | null> {
        const channel = await this.prisma.chat.findUnique({ where: { id: data.chatId } });
        const userChannel = await this.prisma.userChat.findFirst({ where: { chatId: data.chatId, userId: userId } });
        if (userChannel.status != UserChatStatus.OWNER && userChannel.status != UserChatStatus.ADMIN)
            throw new BadRequestException("Not allowed to perform this action");
        const memberChannel = await this.prisma.userChat.findFirst({ where: { chatId: data.chatId, userId: data.userId } });
        if (userChannel.status == UserChatStatus.OWNER) {           
            if (data.status == UserChatStatus.ADMIN || data.status == UserChatStatus.MEMBER || !data.status) {    
                if (data.permission == UserChatPermission.KICKED)
                    return (await this.prisma.userChat.delete({ where: { id: memberChannel.id } }));        
                return (await this.prisma.userChat.update({ where: { id: memberChannel.id }, data: { status: data.status, permission: data.permission } }));
            }
        }
        if (userChannel.status == UserChatStatus.ADMIN && memberChannel.status == UserChatStatus.MEMBER) {
            return (await this.prisma.userChat.update({ where: { id: memberChannel.id }, data: { permission: data.permission } }));
        }
        else
            throw new BadRequestException("Not allowed to perform this action");
    }

    async editChannel(userId: string, chatId: string, settings: EditChannelDto): Promise<Chat | null> {
        const channel = await this.prisma.chat.findUnique({ where: { id: chatId } });
        if (!channel) {
            throw new BadRequestException("Channel not found");
        }
        const userChannel = await this.prisma.userChat.findFirst({ where: { chatId: chatId, userId: userId } });
        if (!userChannel || userChannel.status != UserChatStatus.OWNER) {
            throw new BadRequestException("User is not the owner of the channel");
        }
        if (settings.type == ChatType.DIRECT) {
            throw new BadRequestException("Can't change direct channel");
        }
        if (settings.type == ChatType.RESTRICTED && !settings.password) 
            throw new BadRequestException("Password is required for restricted channel");
        let passwd = null;
        if (settings.password)
            passwd = await this.generatePasswd(settings.password);
        const updated = await this.prisma.chat.update({
            where: {
                id: chatId
            },
            data: {
                name: settings.name,
                passwd: passwd,
                type: settings.type
            }
        }).catch((err) => {
            throw new BadRequestException(err);
        });
        return updated;
        
    }

    
    async deletechannel(chatId: string, userId: string): Promise<Chat | null> {
        // Check if channel exist
        const channel = await this.prisma.chat.findUnique({ where: { id: chatId } });
        if (!channel) {
            throw new BadRequestException("Channel not found");
        }

        const user = await this.prisma.user.findUnique({
            where: {
                id: userId
            }
        }).catch((err) => {
            throw new BadRequestException(err);
        });

        if (user.role != "ADMIN") {
            const userChat = await this.prisma.userChat.findMany({
                where: {
                    chatId: chatId,
                    userId: userId,
                    status: UserChatStatus.OWNER
                }
            });
            if (userChat.length == 0) {
                throw new BadRequestException("User is not the owner of the channel");
            }

            await this.prisma.userChat.deleteMany({
                where: {
                    chatId: chatId
                }
            }).catch((err) => {
                throw new BadRequestException(err);
            });
            const deleted = this.prisma.chat.delete({
                where: {
                    id: chatId
                }
            }).catch((err) => {
                throw new BadRequestException(err);
            });
            return deleted;
        }
    }
}
