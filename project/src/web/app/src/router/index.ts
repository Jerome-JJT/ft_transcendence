import { useUserStore } from "@/stores/user";
import { useAlertStore } from "@/stores/alert";
import { createRouter, createWebHistory } from "vue-router";
import type { AlertInterface } from "@/interfaces/alert.interface";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/auth",
      name: "auth",
      meta: {
        title: "Authentification",
      },
      component: () => import("@/views/auth/AuthLayout.vue"),
      children: [
        {
          path: "/login",
          name: "login",
          meta: {
            title: "Login",
          },
          component: () => import("@/views/auth/LoginView.vue"),
        },
        {
          path: "/signout/:id",
          name: "signout",
          meta: {
            title: "Signout",
          },
          component: () => import("@/views/auth/LoginView.vue"),
        },
        {
          path: "/signin",
          name: "signin",
          meta: {
            title: "Signin",
          },
          component: () => import("@/views/auth/LoginView.vue"),
        },
      ],
    },
    {
      path: "/users",
      name: "users",
      meta: {
        title: "Utilisateurs",
        requiresAuth: true,
      },
      component: () => import("@/views/users/UsersLayout.vue"),
      children: [
        {
          path: "/users",
          redirect: "/users/all",
        },
        {
          path: "/profile",
          name: "profile",
          meta: {
            title: "Profile",
          },
          component: () => import("@/views/users/ProfileView.vue"),
        },
        {
          path: "/users/:pseudo",
          name: "user",
          meta: {
            title: (route: { params: { pseudo: any } }) =>
              `Profile de ${route.params.pseudo} - ${
                import.meta.env.VITE_APP_TITLE
              }`,
          },
          component: () => import("@/views/users/ProfileView.vue"),
        },
        {
          path: "/users/:id/edit",
          name: "user-edit",
          meta: {
            title: "Editer un utilisateur",
          },
          component: () => import("@/views/users/UsersEditView.vue"),
        },
        {
          path: "/users/all",
          name: "users-all",
          meta: {
            title: "Tous les utilisateurs",
          },
          component: () => import("@/views/users/UsersView.vue"),
        },
      ],
    },
    {
      path: "/chats",
      name: "chats",
      meta: {
        title: "Chats",
        requiresAuth: true,
      },
      component: () => import("@/views/chats/ChatsLayout.vue"),
      children: [
        {
          path: "/chats/:id",
          name: "chat",
          meta: {
            title: "Chat",
          },
          component: () => import("@/views/chats/ChatsView.vue"),
        },
      ],
    },
    {
      path: "/channels",
      name: "channels",
      meta: {
        title: "Channels",
        requiresAuth: true,
      },
      component: () => import("@/views/channels/ChannelsLayout.vue"),
      children: [
        {
          path: "/channels/:id",
          name: "channel",
          meta: {
            title: "Channel",
          },
          component: () => import("@/views/channels/ChannelsView.vue"),
        },
        {
          path: "/channels/create",
          name: "channel-create",
          meta: {
            title: "Channel-create"
          },
          component: () => import("@/views/channels/ChannelsView.vue"),
        },
        {
          path: "/channels/:id/edit",
          name: "channel-edit",
          meta: {
            title: "Channel-edit"
          },
          component: () => import("@/views/channels/ChannelsView.vue"),
        },
      ],
    },
    {
      path: "/friends",
      name: "friends",
      meta: {
        title: "Amis",
        requiresAuth: true,
      },
      component: () => import("@/views/friends/FriendsLayout.vue"),
      children: [
        {
          path: "/friends",
          redirect: "/friends/all",
        },
        {
          path: "/friends/all",
          name: "friends-all",
          meta: {
            title: "Tous mes amis",
          },
          component: () => import("@/views/friends/FriendsView.vue"),
        },
        {
          path: "/friends/requests",
          name: "friends-requests",
          meta: {
            title: "Demandes d'amis",
          },
          component: () => import("@/views/friends/FriendsRequestsView.vue"),
        },
        {
          path: "/friends/sent",
          name: "friends-sent",
          meta: {
            title: "Demandes d'amis envoyées",
          },
          component: () =>
            import("@/views/friends/FriendsRequestsSentView.vue"),
        },
      ],
    },
    {
      path: "/games",
      name: "games",
      meta: {
        title: "Games",
        requiresAuth: true,
      },
      component: () => import("@/views/games/GamesLayout.vue"),
      children: [
        {
          path: "/games/:id",
          name: "game",
          meta: {
            title: "Game",
          },
          component: () => import("@/views/games/GamesView.vue"),
        },
      ],
    },
    {
      path: "/:pathMatch(.*)*", 
      name: "not-found",
      meta: {
        title: "Page non trouvée",
      },
      component: () => import("@/views/NotFoundView.vue"),
    },
    {
      path: "/",
      name: "home",
      meta: {
        title: "Accueil",
        requiresAuth: true,
      },
      component: () => import("@/views/HomeView.vue"),
    },
    {
      path: "/about",
      name: "about",
      meta: {
        title: "A propos",
      },
      component: () => import("@/views/AboutView.vue"),
    },
    {
      path: "/2fa",
      name: "2fa",
      meta: {
        title: "Two factor authentification",
        requiresAuth: true,
      },
      component: () => import("@/views/2fa/TwoFactorView.vue"),
    },
    {
      path: "/login_2fa",
      name: "login_2fa",
      meta: {
        title: "Two factor authentification login",
      },
      component: () => import("@/views/2fa/TwoFactorLoginView.vue"),
    },
  ],
});

const isAuthenticated = () => {
  const userStore = useUserStore();
  const alertStore = useAlertStore();
  if (!userStore.isAuthenticated) {
      const alert = {
        status: 401,
        message: 'Vous devez être connecté pour accéder à cette page',
    } as AlertInterface;
    alertStore.setAlert(alert);
  }
  return userStore.isAuthenticated;
};

router.beforeEach((to, from, next) => {
  if (to.matched.some((record) => record.meta.requiresAuth)) {
    if (!isAuthenticated()) {
      next({
        path: "/login",
      });
      return;
    }
  }

  if (to.meta.title) {
    document.title =
      typeof to.meta.title === "function"
        ? to.meta.title(to)
        : `${to.meta.title} - ${import.meta.env.VITE_APP_TITLE}`;
  } else {
    document.title = `${import.meta.env.VITE_APP_TITLE}`;
  }

  next();
});

export default router;
