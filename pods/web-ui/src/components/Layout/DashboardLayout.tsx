import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../ThemeProvider';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '../ui/sidebar';
import { Moon, Sun, User, LogOut, Bot, Server, Workflow, Drone } from 'lucide-react';
import { Badge } from '../ui/badge';

interface DashboardLayoutProps {
  children: React.ReactNode;
  noPadding?: boolean;
  hideSidebar?: boolean;
}


export function DashboardLayout({ children, noPadding = false, hideSidebar = false }: DashboardLayoutProps) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const currentPath = location.pathname.split('/')[2] || 'agents';

  const navigationItems = [
    {
      title: "Agentes",
      url: "/dashboard/agents",
      icon: Bot,
      isActive: currentPath === 'agents'
    },
    {
      title: "MCP",
      url: "/dashboard/mcp",
      icon: Server,
      isActive: currentPath === 'mcp'
    },
    // {
    //   title: "Documentos",
    //   url: "/dashboard/documents",
    //   icon: FileText,
    //   isActive: currentPath === 'documents'
    // },
    {
      title: "Flows",
      url: "/dashboard/flows",
      icon: Workflow,
      isActive: currentPath === 'flows'
    },
    {
      title: "LLMs",
      url: "/dashboard/llms",
      icon: Drone,
      isActive: currentPath === 'llms'
    }
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // If sidebar is hidden, render without SidebarProvider
  if (hideSidebar) {
    return (
      <div className="min-h-screen w-full bg-background">
        <main className={`w-full h-screen ${noPadding ? '' : 'p-6'}`}>
          {children}
        </main>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <Sidebar collapsible="icon">
          <SidebarHeader className="border-b">
            <div className="flex items-center justify-between px-6 py-4 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:justify-center">
              <div className="flex flex-col gap-1 group-data-[collapsible=icon]:hidden">
                <h1 className="text-lg font-bold text-foreground">
                  HNL Pods
                </h1>
                <Badge variant="outline" className="w-fit text-xs bg-primary/10 text-primary border-primary/30">
                  v1.0.3
                </Badge>
              </div>
              <SidebarTrigger className="h-6 w-6" />
            </div>
          </SidebarHeader>

          <SidebarContent className="flex flex-col">
            {/* Main Navigation */}
            <div className="flex-1">
              <SidebarGroup>
                <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">Navigation</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {navigationItems.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          onClick={() => navigate(item.url)}
                          isActive={item.isActive}
                          tooltip={item.title}
                          className="w-full"
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </div>

            {/* Bottom User Controls */}
            <div className="mt-auto border-t pt-4">
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {/* Theme Toggle */}
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={toggleTheme}
                        tooltip={theme === 'light' ? 'Dark Mode' : 'Light Mode'}
                        className="w-full"
                      >
                        {theme === 'light' ? (
                          <Moon className="h-4 w-4" />
                        ) : (
                          <Sun className="h-4 w-4" />
                        )}
                        <span>{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    {/* User Info */}
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        tooltip={user?.username}
                        className="w-full"
                      >
                        <User className="h-4 w-4" />
                        <span>{user?.username}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    {/* Logout */}
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={handleLogout}
                        tooltip="Logout"
                        className="w-full"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>Logout</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </div>
          </SidebarContent>
        </Sidebar>

        <SidebarInset className="flex-1 relative">
          {/* Main Content */}
          <main className={`flex-1 ${noPadding ? '' : 'p-6'}`}>
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
