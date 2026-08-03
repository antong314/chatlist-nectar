import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { toast } from 'sonner';
import { ContactForm } from '@/features/directory/components/ContactForm';
import type { ProviderDeletionRequest } from '@/features/directory/components/ProviderDeletionDialog';
import type { Contact } from '@/types/contact';
import Index from '@/pages/Index';
import { useContacts } from '@/hooks/useContacts';

jest.mock('@/hooks/useContacts', () => ({
  useContacts: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

jest.mock('sonner', () => ({
  toast: {
    dismiss: jest.fn(),
    error: jest.fn(),
    loading: jest.fn(),
    success: jest.fn(),
  },
}));

const provider: Contact = {
  id: 'provider-1',
  name: 'Sample Provider',
  category: 'Service',
  description: 'Trusted local help.',
  phone: '+506 8888 1212',
};

const deletionReceipt = {
  eventId: 'event-123',
  undoToken: 'undo-secret',
  undoExpiresAt: new Date(Date.now() + 60_000).toISOString(),
};

const renderContactForm = (onDelete: (request: ProviderDeletionRequest) => Promise<void>) => render(
  <ContactForm
    categories={['Service']}
    contact={provider}
    onCancel={jest.fn()}
    onDelete={onDelete}
    onSave={jest.fn()}
  />,
);

const openDeletionDialog = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /delete listing/i }));
  return screen.getByRole('dialog', { name: /remove this provider/i });
};

const fillDeletionForm = async (
  user: ReturnType<typeof userEvent.setup>,
  name = provider.name,
) => {
  await user.type(screen.getByLabelText(/type sample provider to confirm/i), name);
  await user.selectOptions(screen.getByLabelText(/why should this listing be removed/i), 'duplicate');
  await user.type(screen.getByLabelText(/your whatsapp number/i), '+506 8777 1234');
  await user.type(screen.getByLabelText(/community deletion code/i), 'community-code');
};

describe('provider deletion request flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (toast.success as jest.Mock).mockReturnValue('removal-toast-id');
    window.history.replaceState({}, '', '/');
  });

  test('opens an intentional dialog without calling deletion or window.confirm', async () => {
    const user = userEvent.setup();
    const onDelete = jest.fn().mockResolvedValue(undefined);
    const confirmSpy = jest.spyOn(window, 'confirm');
    renderContactForm(onDelete);

    const deletionDialog = await openDeletionDialog(user);

    expect(deletionDialog).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByText(/hide the listing from the public directory/i)).toBeInTheDocument();
    expect(screen.getByText(/recoverable for a short time/i)).toBeInTheDocument();
    expect(screen.getByText(/private community WhatsApp group/i)).toBeInTheDocument();
    expect(screen.getByText(/kept private as an audit contact/i)).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  test('keeps removal disabled for a mismatched name and accepts normalized matching', async () => {
    const user = userEvent.setup();
    renderContactForm(jest.fn().mockResolvedValue(undefined));
    await openDeletionDialog(user);
    await fillDeletionForm(user, 'Wrong Provider');

    const removeButton = screen.getByRole('button', { name: /remove listing/i });
    expect(removeButton).toBeDisabled();
    expect(screen.getByText(/provider name does not match/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/type sample provider to confirm/i));
    await user.type(screen.getByLabelText(/type sample provider to confirm/i), '  sample   provider  ');
    expect(removeButton).toBeEnabled();
    expect(screen.getByText(/capitalization and extra spaces do not matter/i)).toBeInTheDocument();
  });

  test('submits every required value with the agreed API payload shape', async () => {
    const user = userEvent.setup();
    const onDelete = jest.fn().mockResolvedValue(undefined);
    renderContactForm(onDelete);
    await openDeletionDialog(user);
    await fillDeletionForm(user);

    await user.click(screen.getByRole('button', { name: /remove listing/i }));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith({
        providerId: provider.id,
        providerNameConfirmation: provider.name,
        reason: 'duplicate',
        requesterWhatsapp: '+506 8777 1234',
        communityCode: 'community-code',
      });
    });
    expect(screen.getByLabelText(/community deletion code/i)).toHaveAttribute('type', 'password');
  });

  test('prevents duplicate submissions and keeps backend errors in the dialog', async () => {
    const user = userEvent.setup();
    let rejectRequest: (error: Error) => void = () => undefined;
    const onDelete = jest.fn().mockImplementation(() => new Promise<void>((_resolve, reject) => {
      rejectRequest = reject;
    }));
    renderContactForm(onDelete);
    await openDeletionDialog(user);
    await fillDeletionForm(user);

    const removeButton = screen.getByRole('button', { name: /remove listing/i });
    await user.click(removeButton);
    expect(removeButton).toBeDisabled();
    await user.click(removeButton);
    expect(onDelete).toHaveBeenCalledTimes(1);

    rejectRequest(new Error('The community deletion code is incorrect.'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/community deletion code is incorrect/i);
    expect(screen.getByRole('dialog', { name: /remove this provider/i })).toBeInTheDocument();
  });

  test('Cancel and Escape return to the edit form without deleting', async () => {
    const user = userEvent.setup();
    const onDelete = jest.fn().mockResolvedValue(undefined);
    renderContactForm(onDelete);
    const deleteTrigger = screen.getByRole('button', { name: /delete listing/i });

    await openDeletionDialog(user);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: /remove this provider/i })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Edit provider' })).toBeInTheDocument();
    expect(deleteTrigger).toHaveFocus();

    await openDeletionDialog(user);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: /remove this provider/i })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Edit provider' })).toBeInTheDocument();
    expect(deleteTrigger).toHaveFocus();
    expect(onDelete).not.toHaveBeenCalled();
  });

  test('Escape closes only the nested deletion dialog on the directory page', async () => {
    const user = userEvent.setup();
    const deleteContact = jest.fn();
    (useContacts as jest.Mock).mockReturnValue({
      contacts: [provider],
      loading: false,
      error: null,
      searchQuery: '',
      setSearchQuery: jest.fn(),
      selectedCategory: 'All',
      setSelectedCategory: jest.fn(),
      uniqueCategories: ['All', 'Service'],
      refreshContacts: jest.fn(),
      addContact: jest.fn(),
      updateContact: jest.fn(),
      deleteContact,
      undoDelete: jest.fn(),
    });
    render(
      <BrowserRouter>
        <Index />
      </BrowserRouter>,
    );

    await user.click(screen.getByRole('button', { name: `Edit ${provider.name}` }));
    await openDeletionDialog(user);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: /remove this provider/i })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Edit provider' })).toBeInTheDocument();
    expect(deleteContact).not.toHaveBeenCalled();
  });

  test('server success removes the listing, closes editing, and Undo restores through the token then refreshes', async () => {
    const user = userEvent.setup();
    const requestDeletion = jest.fn().mockResolvedValue(deletionReceipt);
    const undoDelete = jest.fn()
      .mockRejectedValueOnce(new Error('This Undo link has expired or was already used.'))
      .mockResolvedValueOnce(undefined);
    const refreshContacts = jest.fn();

    function useMockContacts() {
      const [contacts, setContacts] = React.useState([provider]);

      return {
        contacts,
        loading: false,
        error: null,
        searchQuery: '',
        setSearchQuery: jest.fn(),
        selectedCategory: 'All',
        setSelectedCategory: jest.fn(),
        uniqueCategories: ['All', 'Service'],
        refreshContacts,
        addContact: jest.fn(),
        updateContact: jest.fn(),
        deleteContact: async (request: ProviderDeletionRequest) => {
          const receipt = await requestDeletion(request);
          setContacts((currentContacts) => currentContacts.filter((contact) => contact.id !== request.providerId));
          return receipt;
        },
        undoDelete,
      };
    }

    (useContacts as jest.Mock).mockImplementation(useMockContacts);
    render(
      <BrowserRouter>
        <Index />
      </BrowserRouter>,
    );

    await user.click(screen.getByRole('button', { name: `Edit ${provider.name}` }));
    await openDeletionDialog(user);
    await fillDeletionForm(user);
    await user.click(screen.getByRole('button', { name: /remove listing/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Edit provider' })).not.toBeInTheDocument();
      expect(screen.queryByText(provider.name)).not.toBeInTheDocument();
    });

    const removalToast = (toast.success as jest.Mock).mock.calls.find(([title]) => title === 'Listing removed');
    expect(removalToast).toBeDefined();
    const preventDefault = jest.fn();
    removalToast[1].action.onClick({ preventDefault });

    await waitFor(() => {
      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledWith('Could not restore listing', {
        description: 'This Undo link has expired or was already used.',
      });
    });
    expect(refreshContacts).not.toHaveBeenCalled();
    expect(toast.dismiss).not.toHaveBeenCalled();

    removalToast[1].action.onClick({ preventDefault });

    await waitFor(() => {
      expect(undoDelete).toHaveBeenCalledWith({
        eventId: deletionReceipt.eventId,
        undoToken: deletionReceipt.undoToken,
      });
      expect(undoDelete).toHaveBeenCalledTimes(2);
      expect(refreshContacts).toHaveBeenCalledTimes(1);
    });
    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(toast.dismiss).toHaveBeenCalledWith('removal-toast-id');
    expect(toast.success).toHaveBeenCalledWith('Listing restored', expect.any(Object));
  });
});
