// Users Management Page
let currentUsersPage = 1;
let usersFilters = {
  role: '',
  verificationStatus: '',
  search: ''
};

async function loadUsers() {
  const pageContent = document.getElementById('pageContent');

  pageContent.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Users Management</h3>
      </div>
      <div class="card-body">
        <div class="d-flex justify-between align-center mb-20">
          <div class="d-flex gap-10">
            <select id="roleFilter" onchange="filterUsers()">
              <option value="">All Roles</option>
              <option value="customer">Customer</option>
              <option value="distributor">Distributor</option>
              <option value="storeOwner">Store Owner</option>
              <option value="driver">Driver</option>
            </select>
            <select id="statusFilter" onchange="filterUsers()">
              <option value="">All Status</option>
              <option value="verified">Verified</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <input
            type="text"
            id="userSearch"
            placeholder="Search users..."
            oninput="debounce(filterUsers, 500)()"
            style="max-width: 300px;"
          >
        </div>

        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="usersTableBody">
              <tr><td colspan="7" class="text-center">Loading...</td></tr>
            </tbody>
          </table>
        </div>

        <div id="usersPagination"></div>
      </div>
    </div>
  `;

  await fetchUsers();
}

async function fetchUsers() {
  try {
    showLoading();

    const params = {
      page: currentUsersPage,
      limit: 20,
      ...usersFilters
    };

    const response = await api.get('/admin/users', params);

    if (response.success) {
      renderUsers(response.data, response.pagination);
    }

    hideLoading();
  } catch (error) {
    console.error('Error fetching users:', error);
    showToast('Error loading users', 'error');
    hideLoading();
  }
}

function renderUsers(users, pagination) {
  const tbody = document.getElementById('usersTableBody');

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">No users found</td></tr>';
    return;
  }

  tbody.innerHTML = users
    .map((user) => {
      const canVerify =
        (user.role === 'storeOwner' || user.role === 'distributor') &&
        user.verificationStatus === 'pending';

      return `
        <tr>
          <td>
            <div class="d-flex align-center gap-10">
              <img src="${
                user.profileImage ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}`
              }"
                   alt="${user.name}"
                   style="width: 32px; height: 32px; border-radius: 50%;">
              <span>${user.name}</span>
            </div>
          </td>
          <td>${user.email}</td>
          <td>${user.phone}</td>
          <td><span class="badge badge-info">${user.role}</span></td>
          <td><span class="badge ${getStatusBadgeClass(
            user.verificationStatus
          )}">${user.verificationStatus}</span></td>
          <td>${formatDate(user.createdAt)}</td>
          <td>
            <button
              class="btn btn-sm btn-primary view-user-btn"
              data-user-id="${user._id}"
            >
              View / Edit
            </button>
            ${
              canVerify
                ? `
              <button
                class="btn btn-sm btn-success verify-user-btn"
                data-user-id="${user._id}"
                data-status="verified"
              >
                Verify
              </button>
              <button
                class="btn btn-sm btn-danger verify-user-btn"
                data-user-id="${user._id}"
                data-status="rejected"
              >
                Reject
              </button>
            `
                : ''
            }
          </td>
        </tr>
      `;
    })
    .join('');

  tbody.querySelectorAll('.view-user-btn').forEach((button) => {
    button.addEventListener('click', () => {
      viewUser(button.dataset.userId);
    });
  });

  tbody.querySelectorAll('.verify-user-btn').forEach((button) => {
    button.addEventListener('click', () => {
      verifyUser(button.dataset.userId, button.dataset.status);
    });
  });

  // Render pagination
  const paginationContainer = document.getElementById('usersPagination');
  paginationContainer.innerHTML = renderPagination(pagination, 'changeUsersPage');
}

function filterUsers() {
  const roleFilter = document.getElementById('roleFilter').value;
  const statusFilter = document.getElementById('statusFilter').value;
  const search = document.getElementById('userSearch').value;

  usersFilters = {
    role: roleFilter,
    verificationStatus: statusFilter,
    search
  };

  currentUsersPage = 1;
  fetchUsers();
}

function changeUsersPage(page) {
  currentUsersPage = page;
  fetchUsers();
}

async function viewUser(userId) {
  try {
    showLoading();
    const response = await api.get(`/admin/users/${userId}`);

    if (response.success) {
      const user = response.data.user;

      // Simple inline edit form for key fields
      showModal(
        'User Details',
        `
        <form id="editUserForm" style="display: grid; gap: 15px;">
          <div>
            <img src="${
              user.profileImage ||
              `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}`
            }"
                 alt="${user.name}"
                 style="width: 100px; height: 100px; border-radius: 50%;">
          </div>
          <div>
            <label><strong>Name:</strong></label>
            <input type="text" id="editUserName" value="${user.name}" />
          </div>
          <div>
            <label><strong>Email:</strong></label>
            <input type="email" id="editUserEmail" value="${user.email}" />
          </div>
          <div>
            <label><strong>Phone:</strong></label>
            <input type="text" id="editUserPhone" value="${user.phone}" />
          </div>
          <div>
            <label><strong>Role:</strong></label>
            <select id="editUserRole">
              <option value="customer" ${
                user.role === 'customer' ? 'selected' : ''
              }>Customer</option>
              <option value="distributor" ${
                user.role === 'distributor' ? 'selected' : ''
              }>Distributor</option>
              <option value="storeOwner" ${
                user.role === 'storeOwner' ? 'selected' : ''
              }>Store Owner</option>
              <option value="driver" ${
                user.role === 'driver' ? 'selected' : ''
              }>Driver</option>
            </select>
          </div>
          <div>
            <label><strong>Status:</strong></label>
            <select id="editUserStatus">
              <option value="pending" ${
                user.verificationStatus === 'pending' ? 'selected' : ''
              }>Pending</option>
              <option value="verified" ${
                user.verificationStatus === 'verified' ? 'selected' : ''
              }>Verified</option>
              <option value="rejected" ${
                user.verificationStatus === 'rejected' ? 'selected' : ''
              }>Rejected</option>
            </select>
          </div>
          ${
            user.distributorCode
              ? `<div><strong>Distributor Code:</strong> ${user.distributorCode}</div>`
              : ''
          }
          <div><strong>Joined:</strong> ${formatDate(user.createdAt, 'long')}</div>
          <div><strong>Last Login:</strong> ${
            user.lastLogin ? formatDate(user.lastLogin, 'datetime') : 'Never'
          }</div>
          <div class="modal-actions" style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
            <button type="button" class="btn btn-outline" id="editUserCancel">Close</button>
            <button type="submit" class="btn btn-primary">Save changes</button>
          </div>
        </form>
      `
      );

      const editForm = document.getElementById('editUserForm');
      const cancelBtn = document.getElementById('editUserCancel');

      cancelBtn.addEventListener('click', () => {
        hideModal();
      });

      editForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        try {
          showLoading();
          const updatedData = {
            name: document.getElementById('editUserName').value.trim(),
            email: document.getElementById('editUserEmail').value.trim(),
            phone: document.getElementById('editUserPhone').value.trim(),
            role: document.getElementById('editUserRole').value,
            verificationStatus: document.getElementById('editUserStatus').value
          };

          const updateResponse = await api.put(`/admin/users/${userId}`, updatedData);

          if (updateResponse.success) {
            showToast('User updated successfully', 'success');
            hideModal();
            fetchUsers();
          } else {
            showToast(updateResponse.message || 'Error updating user', 'error');
          }

          hideLoading();
        } catch (err) {
          console.error('Error updating user:', err);
          showToast(err.message || 'Error updating user', 'error');
          hideLoading();
        }
      });
    }

    hideLoading();
  } catch (error) {
    console.error('Error viewing user:', error);
    showToast('Error loading user details', 'error');
    hideLoading();
  }
}

async function verifyUser(userId, status) {
  const isVerified = status === 'verified';
  const message = isVerified
    ? 'Are you sure you want to verify this user?'
    : 'Are you sure you want to reject this user?';

  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modalBody');

  if (!modal || !modalBody) {
    return;
  }

  modalBody.innerHTML = `
    <h2>Confirm</h2>
    <p>${message}</p>
    <div class="modal-actions" style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
      <button type="button" class="btn btn-outline" id="verify-user-cancel">Cancel</button>
      <button type="button" class="btn btn-primary" id="verify-user-confirm">Confirm</button>
    </div>
  `;
  modal.classList.add('show');

  const cancelButton = document.getElementById('verify-user-cancel');
  const confirmButton = document.getElementById('verify-user-confirm');

  cancelButton.addEventListener('click', () => {
    hideModal();
  });

  confirmButton.addEventListener('click', async () => {
    hideModal();

    try {
      showLoading();

      const data = { status };
      if (status === 'rejected') {
        data.reason = prompt('Enter rejection reason:');
        if (!data.reason) {
          hideLoading();
          return;
        }
      }

      // Use existing backend route that verifies distributors/store owners
      const response = await api.put(`/admin/distributors/${userId}/verify`, data);

      if (response.success) {
        showToast(`User ${status} successfully`, 'success');
        fetchUsers();
      } else {
        showToast(response.message || 'Error verifying user', 'error');
      }

      hideLoading();
    } catch (error) {
      console.error('Error verifying user:', error);
      showToast(error.message || 'Error verifying user', 'error');
      hideLoading();
    }
  });
}

window.loadUsers = loadUsers;
window.fetchUsers = fetchUsers;
window.renderUsers = renderUsers;
window.filterUsers = filterUsers;
window.changeUsersPage = changeUsersPage;
window.viewUser = viewUser;
window.verifyUser = verifyUser;