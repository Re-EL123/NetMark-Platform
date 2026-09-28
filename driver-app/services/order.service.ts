import create from "zustand";
import api, { getApiErrorMessage } from './api';

export interface CompleteDeliveryResult {
  success: boolean;
  message?: string;
}

interface OrderState {
  availableOrders: any[];
  activeDelivery: any;
  myDeliveries: any[];
  fetchAvailableOrders: () => Promise<void>;
  fetchMyDeliveries: () => Promise<void>;
  acceptOrder: (orderId: string) => Promise<boolean>;
  updateDeliveryStatus: (orderId: string, status: string) => Promise<boolean>;
  completeDelivery: (
    orderId: string,
    otp?: string,
    notes?: string
  ) => Promise<CompleteDeliveryResult>;
}

export const useOrderStore = create<OrderState>((set, get) => ({
  availableOrders: [],
  activeDelivery: null,
  myDeliveries: [],

  fetchAvailableOrders: async () => {
    try {
      const response = await api.get('/drivers/deliveries/available');
      if (response.success) {
        set({ availableOrders: response.data.orders });
      }
    } catch (error) {
      console.error('Error fetching available orders:', error);
    }
  },

  fetchMyDeliveries: async () => {
    try {
      const response = await api.get('/drivers/deliveries/mine');
      if (response.success) {
        const active = response.data.orders.find(
          (o: any) => o.orderStatus === 'in_transit' || o.orderStatus === 'ready'
        );
        set({ 
          myDeliveries: response.data.orders,
          activeDelivery: active || null 
        });
      }
    } catch (error) {
      console.error('Error fetching my deliveries:', error);
    }
  },

  acceptOrder: async (orderId: string) => {
    try {
      const response = await api.post(`/drivers/deliveries/${orderId}/accept`);
      if (response.success) {
        await get().fetchAvailableOrders();
        await get().fetchMyDeliveries();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error accepting order:', error);
      return false;
    }
  },

  updateDeliveryStatus: async (orderId: string, status: string) => {
    try {
      const response = await api.put(`/drivers/deliveries/${orderId}/status`, {
        status,
        note: `Status updated to ${status}`,
      });
      if (response.success) {
        await get().fetchMyDeliveries();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error updating delivery status:', error);
      return false;
    }
  },

  completeDelivery: async (
    orderId: string,
    otp?: string,
    notes?: string
  ): Promise<CompleteDeliveryResult> => {
    try {
      const response = await api.post(`/drivers/deliveries/${orderId}/complete`, {
        otp,
        notes,
      });
      if (response?.success) {
        await get().fetchMyDeliveries();
        return { success: true, message: response.message };
      }
      return {
        success: false,
        message: response?.message || 'Failed to complete delivery.',
      };
    } catch (error) {
      console.error('Error completing delivery:', error);
      const message = getApiErrorMessage(error, 'Failed to complete delivery.');
      return { success: false, message };
    }
  },
}));