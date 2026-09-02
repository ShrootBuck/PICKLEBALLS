import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

export function AppSidebarSkeleton() {
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" disabled>
              <Skeleton className="size-6 rounded-md" />
              <Skeleton className="h-4 w-24" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>School first</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {[0, 1, 2].map((i) => (
                <SidebarMenuItem key={i}>
                  <SidebarMenuButton disabled>
                    <Skeleton className="size-4 rounded-full" />
                    <Skeleton className="h-4 w-20" />
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton disabled>
              <Skeleton className="size-7 rounded-full" />
              <span className="flex min-w-0 flex-col gap-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-2 w-14" />
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <Skeleton className="h-8 w-full rounded-md" />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
