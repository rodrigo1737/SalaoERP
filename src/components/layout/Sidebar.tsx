import { type ComponentType, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import {
  ArrowRightLeft,
  BarChart3,
  Building2,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Home,
  LogOut,
  Menu,
  Package,
  PackagePlus,
  Percent,
  RefreshCw,
  Scissors,
  Settings,
  Shield,
  ShoppingBag,
  Sparkles,
  Truck,
  UserCircle,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import {
  type AppPageId,
  type NavigationAccessContext,
  type SidebarSectionDefinition,
  type SidebarTargetId,
  getSidebarTargetDefinition,
  getVisibleSidebarSections,
  getVisibleTopTargets,
} from '@/lib/appNavigation';
import { isCleaningControlTenant } from '@/lib/tenantSegments';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

const TARGET_ICONS: Record<SidebarTargetId, ComponentType<{ className?: string }>> = {
  dashboard: Home,
  agenda: Calendar,
  clients: Users,
  professionals: UserCircle,
  services: Scissors,
  'commission-matrix': Percent,
  products: ShoppingBag,
  aesthetics: Sparkles,
  cleaning: Sparkles,
  suppliers: Truck,
  purchase: PackagePlus,
  'stock-movements': ArrowRightLeft,
  commissions: DollarSign,
  'commission-reprocessing': RefreshCw,
  'professional-statement': Wallet,
  reports: BarChart3,
  cashier: DollarSign,
  'financial-management': BarChart3,
  settings: Settings,
  'super-dashboard': Shield,
  tenants: Building2,
  'admin-access': Shield,
};

const SECTION_ICONS: Record<SidebarSectionDefinition['id'], ComponentType<{ className?: string }>> = {
  operation: Calendar,
  registrations: UserCircle,
  financial: DollarSign,
  inventory: Package,
  reports: BarChart3,
  administration: Shield,
};

const DEFAULT_EXPANDED_SECTIONS: SidebarSectionDefinition['id'][] = [
  'operation',
  'registrations',
  'financial',
];

const SIDEBAR_SCROLL_STORAGE_KEY = 'multisolution.sidebar.scroll-position';

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<string[]>(DEFAULT_EXPANDED_SECTIONS);
  const navRef = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();
  const { user, userRole, isOwner, isSuperAdmin, currentTenant, signOut, hasPermission } = useAuth();
  const { settings: tenantSettings } = useTenantSettings();
  const isCleaningTenant = isCleaningControlTenant(currentTenant);

  const navigationContext = useMemo<NavigationAccessContext>(() => ({
    isSuperAdmin,
    userRole,
    currentTenant,
    hasPermission,
  }), [currentTenant, hasPermission, isSuperAdmin, userRole]);

  const topTargets = useMemo(
    () => getVisibleTopTargets(navigationContext),
    [navigationContext],
  );

  const visibleSections = useMemo(
    () => getVisibleSidebarSections(navigationContext),
    [navigationContext],
  );

  useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof window === 'undefined') return;

    const storedPosition = window.sessionStorage.getItem(SIDEBAR_SCROLL_STORAGE_KEY);
    if (!storedPosition) return;

    nav.scrollTop = Number(storedPosition) || 0;
  }, [currentPage, collapsed, expandedSections, mobileOpen]);

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  const handleNavScroll = () => {
    const nav = navRef.current;
    if (!nav || typeof window === 'undefined') return;
    window.sessionStorage.setItem(SIDEBAR_SCROLL_STORAGE_KEY, String(nav.scrollTop));
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => (
      prev.includes(sectionId)
        ? prev.filter((id) => id !== sectionId)
        : [...prev, sectionId]
    ));
  };

  const isTargetActive = (targetId: SidebarTargetId) => {
    const definition = getSidebarTargetDefinition(targetId);

    if (targetId === 'admin-access') {
      return currentPage === 'admin-access';
    }

    return definition.appPageId === currentPage;
  };

  const isSectionActive = (section: SidebarSectionDefinition) => (
    section.targets.some((target) => isTargetActive(target))
  );

  const handleTargetNavigation = (target: SidebarTargetId) => {
    const definition = getSidebarTargetDefinition(target);

    if (definition.appPageId) {
      onNavigate(definition.appPageId);
    } else {
      navigate(definition.path);
    }

    setMobileOpen(false);
  };

  const NavContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          {isSuperAdmin ? (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
          ) : tenantSettings?.logo_url ? (
            <img
              src={tenantSettings.logo_url}
              alt={isCleaningTenant ? 'Logo da empresa de limpeza' : 'Logo do salão'}
              className="w-10 h-10 rounded-xl object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center">
              {isCleaningTenant ? (
                <Sparkles className="w-5 h-5 text-primary-foreground" />
              ) : (
                <Scissors className="w-5 h-5 text-primary-foreground" />
              )}
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
                {isSuperAdmin ? 'Super Admin' : isCleaningTenant ? 'Controle de Limpeza' : 'Gestão de Salão'}
              </span>
            </motion.div>
          )}
        </div>
      </div>

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
            {isSuperAdmin
              ? 'Administrador Global'
              : isOwner
                ? 'Owner'
                : userRole === 'admin'
                  ? 'Administrador'
                  : userRole === 'professional'
                    ? 'Profissional'
                    : userRole === 'staff'
                      ? 'Equipe interna'
                      : 'Usuário'}
          </p>
        </div>
      )}

      <nav
        ref={navRef}
        onScroll={handleNavScroll}
        className="flex-1 py-6 px-3 space-y-4 overflow-y-auto scrollbar-thin"
      >
        <div className="space-y-1">
          {topTargets.map((target) => {
            const definition = getSidebarTargetDefinition(target);
            const Icon = TARGET_ICONS[target];
            const isActive = isTargetActive(target);

            return (
              <button
                key={target}
                onClick={() => handleTargetNavigation(target)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200',
                  'hover:bg-sidebar-accent',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-glow'
                    : 'text-sidebar-foreground/70 hover:text-sidebar-foreground',
                )}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="font-medium text-sm flex-1 text-left"
                  >
                    {definition.label}
                  </motion.span>
                )}
              </button>
            );
          })}
        </div>

        {visibleSections.map((section) => {
          const SectionIcon = SECTION_ICONS[section.id];
          const expanded = expandedSections.includes(section.id);
          const active = isSectionActive(section);

          return (
            <div key={section.id} className="space-y-1">
              <button
                onClick={() => toggleSection(section.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2 rounded-xl transition-all duration-200',
                  'hover:bg-sidebar-accent',
                  active
                    ? 'text-sidebar-foreground bg-sidebar-accent'
                    : 'text-sidebar-foreground/60 hover:text-sidebar-foreground',
                )}
              >
                <SectionIcon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && (
                  <>
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] flex-1 text-left">
                      {section.label}
                    </span>
                    <ChevronDown className={cn('w-4 h-4 transition-transform', expanded && 'rotate-180')} />
                  </>
                )}
              </button>

              {!collapsed && (
                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden"
                    >
                      <div className="ml-4 pl-4 border-l border-sidebar-border/50 space-y-1">
                        {section.targets.map((target) => {
                          const definition = getSidebarTargetDefinition(target);
                          const Icon = TARGET_ICONS[target];
                          const activeTarget = isTargetActive(target);

                          return (
                            <button
                              key={target}
                              onClick={() => handleTargetNavigation(target)}
                              className={cn(
                                'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200',
                                'hover:bg-sidebar-accent',
                                activeTarget
                                  ? 'bg-primary/10 text-primary font-medium'
                                  : 'text-sidebar-foreground/65 hover:text-sidebar-foreground',
                              )}
                            >
                              <Icon className="w-4 h-4 flex-shrink-0" />
                              <span className="text-sm text-left">{definition.label}</span>
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

      <div className="p-4 border-t border-sidebar-border">
        <button
          onClick={handleLogout}
          className={cn(
            'w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200',
            'text-destructive/70 hover:text-destructive hover:bg-destructive/10',
          )}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="font-medium text-sm">Sair</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 lg:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </Button>

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

      <AnimatePresence>
        {mobileOpen && (
          <motion.aside
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed left-0 top-0 bottom-0 w-[280px] bg-sidebar z-50 lg:hidden shadow-xl"
            style={{ background: 'var(--gradient-sidebar)' }}
          >
            <NavContent />
          </motion.aside>
        )}
      </AnimatePresence>

      <aside
        className={cn(
          'hidden lg:flex flex-col h-screen sticky top-0 transition-all duration-300',
          collapsed ? 'w-20' : 'w-[280px]',
        )}
        style={{ background: 'var(--gradient-sidebar)' }}
      >
        <NavContent />

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
