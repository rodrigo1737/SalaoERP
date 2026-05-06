import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { 
  Calendar, 
  Users, 
  Scissors, 
  ShoppingBag, 
  DollarSign, 
  BarChart3, 
  Package,
  Settings,
  LogOut,
  Menu,
  X,
  Home,
  UserCircle,
  Shield,
  ChevronLeft,
  ChevronRight,
  Building2,
  ChevronDown,
  Truck,
  ArrowRightLeft,
  PackagePlus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

interface MenuItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  permission?: string;
  children?: MenuItem[];
}

// Salon-specific menu items (not shown for super admins)
const salonMenuItems: MenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: Home, adminOnly: true },
  { id: 'agenda', label: 'Agenda', icon: Calendar, adminOnly: false, permission: 'view_schedule' },
  { id: 'clients', label: 'Clientes', icon: Users, adminOnly: true, permission: 'view_clients' },
  { id: 'professionals', label: 'Profissionais', icon: UserCircle, adminOnly: true },
  { id: 'services', label: 'Serviços', icon: Scissors, adminOnly: true },
  { id: 'products', label: 'Produtos', icon: ShoppingBag, adminOnly: true },
  { 
    id: 'stock', 
    label: 'Estoque', 
    icon: Package, 
    adminOnly: true,
    children: [
      { id: 'suppliers', label: 'Fornecedores', icon: Truck, adminOnly: true },
      { id: 'purchase', label: 'Entrada (Compra)', icon: PackagePlus, adminOnly: true },
      { id: 'stock-movements', label: 'Movimentações', icon: ArrowRightLeft, adminOnly: true },
    ]
  },
  { id: 'cashier', label: 'Caixa', icon: DollarSign, adminOnly: true, permission: 'manage_cash_flow' },
  { id: 'reports', label: 'Relatórios', icon: BarChart3, adminOnly: true },
  { id: 'commissions', label: 'Comissões', icon: DollarSign, adminOnly: false, permission: 'view_commissions' },
];

// Super Admin specific menu items
const superAdminMenuItems: MenuItem[] = [
  { id: 'super-dashboard', label: 'Painel B2B', icon: Home },
  { id: 'tenants', label: 'Clientes B2B', icon: Building2 },
];

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<string[]>(['stock']); // Stock expanded by default
  const navigate = useNavigate();
  const { user, userRole, isSuperAdmin, currentTenant, signOut, hasPermission } = useAuth();
  const { settings: tenantSettings } = useTenantSettings();

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  const toggleSubmenu = (menuId: string) => {
    setExpandedMenus(prev => 
      prev.includes(menuId) 
        ? prev.filter(id => id !== menuId)
        : [...prev, menuId]
    );
  };

  const isChildActive = (item: MenuItem): boolean => {
    if (!item.children) return false;
    return item.children.some(child => child.id === currentPage);
  };

  const NavContent = () => {
    // Use super admin menu for super admins, salon menu for others
    const menuItems = isSuperAdmin ? superAdminMenuItems : salonMenuItems;

    const canSeeItem = (item: MenuItem) => {
      if (isSuperAdmin) return true;
      if (userRole === 'admin') return true;
      if (item.id === 'settings') return true;
      if (item.adminOnly && !item.permission) return false;
      if (item.permission) {
        return hasPermission(item.permission) || (item.permission === 'view_schedule' && hasPermission('edit_schedule'));
      }
      return !item.adminOnly;
    };

    return (
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            {isSuperAdmin ? (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center">
                <Shield className="w-5 h-5 text-primary-foreground" />
              </div>
            ) : tenantSettings?.logo_url ? (
              <img 
                src={tenantSettings.logo_url} 
                alt="Logo do salão" 
                className="w-10 h-10 rounded-xl object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center">
                <Scissors className="w-5 h-5 text-primary-foreground" />
              </div>
            )}
            {!collapsed && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex flex-col"
              >
                <span className="text-sm font-semibold text-sidebar-foreground" style={{ fontFamily: 'Arial, sans-serif' }}>
                  {isSuperAdmin ? 'MultiSoluction' : (tenantSettings?.salon_name || 'Beleza')}
                </span>
                <span className="text-xs text-sidebar-foreground/60">
                  {isSuperAdmin ? 'Super Admin' : 'Gestão de Salão'}
                </span>
              </motion.div>
            )}
          </div>
        </div>

        {/* User Info */}
        {!collapsed && user && (
          <div className="px-4 py-3 border-b border-sidebar-border">
            {isSuperAdmin && (
              <p className="text-xs text-primary font-medium mb-1">Super Admin</p>
            )}
            {currentTenant && !isSuperAdmin && (
              <p className="text-xs text-muted-foreground mb-1">{currentTenant.name}</p>
            )}
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {user.email}
            </p>
            <p className="text-xs text-sidebar-foreground/60 capitalize">
              {isSuperAdmin ? 'Administrador Global' : (userRole === 'admin' ? 'Administrador' : userRole === 'professional' ? 'Profissional' : 'Usuário')}
            </p>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto scrollbar-thin">
          {(isSuperAdmin ? menuItems : menuItems.filter(canSeeItem)).map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id || isChildActive(item);
            const hasChildren = item.children && item.children.length > 0;
            const isExpanded = expandedMenus.includes(item.id);
            
            return (
              <div key={item.id}>
                <button
                  onClick={() => {
                    if (hasChildren) {
                      toggleSubmenu(item.id);
                    } else {
                      onNavigate(item.id);
                      setMobileOpen(false);
                    }
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                    "hover:bg-sidebar-accent",
                    isActive && !hasChildren
                      ? "bg-primary text-primary-foreground shadow-glow" 
                      : isActive && hasChildren
                      ? "bg-sidebar-accent text-sidebar-foreground"
                      : "text-sidebar-foreground/70 hover:text-sidebar-foreground"
                  )}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && (
                    <>
                      <motion.span 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="font-medium text-sm flex-1 text-left"
                      >
                        {item.label}
                      </motion.span>
                      {hasChildren && (
                        <ChevronDown className={cn(
                          "w-4 h-4 transition-transform",
                          isExpanded && "rotate-180"
                        )} />
                      )}
                    </>
                  )}
                </button>

                {/* Submenu */}
                {hasChildren && !collapsed && (
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="ml-4 pl-4 border-l border-sidebar-border/50 mt-1 space-y-1">
                          {item.children!.filter(canSeeItem).map((child) => {
                            const ChildIcon = child.icon;
                            const isChildActive = currentPage === child.id;
                            
                            return (
                              <button
                                key={child.id}
                                onClick={() => {
                                  onNavigate(child.id);
                                  setMobileOpen(false);
                                }}
                                className={cn(
                                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200",
                                  "hover:bg-sidebar-accent",
                                  isChildActive 
                                    ? "bg-primary/10 text-primary font-medium" 
                                    : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
                                )}
                              >
                                <ChildIcon className="w-4 h-4 flex-shrink-0" />
                                <span className="text-sm">{child.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border space-y-2">
          {/* Admin Button - Only for tenant admins, not super admins */}
          {userRole === 'admin' && !isSuperAdmin && (
            <button
              onClick={() => {
                navigate('/admin');
                setMobileOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              )}
            >
              <Shield className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span className="font-medium text-sm">Administração</span>}
            </button>
          )}

          {/* Settings - Only for tenant admins, not super admins */}
          {!isSuperAdmin && (
            <button
              onClick={() => onNavigate('settings')}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              )}
            >
              <Settings className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span className="font-medium text-sm">Configurações</span>}
            </button>
          )}

          <button
            onClick={handleLogout}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
              "text-destructive/70 hover:text-destructive hover:bg-destructive/10"
            )}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span className="font-medium text-sm">Sair</span>}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile Toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 lg:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </Button>

      {/* Mobile Overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.aside
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed left-0 top-0 bottom-0 w-[280px] bg-sidebar z-50 lg:hidden shadow-xl"
            style={{ background: 'var(--gradient-sidebar)' }}
          >
            <NavContent />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col h-screen sticky top-0 transition-all duration-300",
          collapsed ? "w-20" : "w-[280px]"
        )}
        style={{ background: 'var(--gradient-sidebar)' }}
      >
        <NavContent />
        
        {/* Collapse Toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-4 top-8 w-8 h-8 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-all duration-200 hover:scale-110 border-2 border-background z-50"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </aside>
    </>
  );
}
