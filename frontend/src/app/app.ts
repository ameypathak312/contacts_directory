import { Component, inject, signal, computed, OnInit,} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ContactService, Contact, Department } from './contact.service';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})



export class AppComponent implements OnInit {
  contactService = inject(ContactService);

  searchTerm = signal<string>('');
  showLoginModal = signal<boolean>(false);
  isEditing = signal<boolean>(false);
  selectedFile: File | null = null;
  
  allContacts = signal<Contact[]>([]);
  allDepartments = signal<Department[]>([]);
  selectedDepartment = signal<string>('');

  loginData = { username: '', password: '' };
  
  // 💡 नवीन ५ फील्ड्स फॉर्म स्टेटमध्ये समाविष्ट
  contactForm = signal<Contact>({
     department_name: '',designation: '', address: '', name: '', mobile_number: '', telephone_number: '', email: '',
    other_contact_1: '', other_contact_2: '', other_contact_3: '', other_contact_4: ''
  });

  newDepartmentName = signal<string>('');

  departmentsList = computed(() => {
    return this.allDepartments().map(d => d.name).sort();
  });

// 💡 app.ts मधील filteredContacts सिग्नल अपडेट करा
filteredContacts = computed(() => {
  const deptFilter = this.selectedDepartment();
  
  // 🚨 जर युझरने कोणताही विभाग निवडला नसेल, तर सुरुवातीला एकही रेकॉर्ड दिसणार नाही
  if (!deptFilter) {
    return [];
  }

  let contacts = this.allContacts();
  const search = this.searchTerm().toLowerCase().trim();

  // निवडलेल्या विभागानुसार फिल्टर करणे
  contacts = contacts.filter(c => c.department_name === deptFilter);

  // सर्च बारमधील कीवर्डनुसार फिल्टर करणे
  if (search) {
    contacts = contacts.filter(c => 
      c.name.toLowerCase().includes(search) || 
      (c.designation && c.designation.toLowerCase().includes(search)) ||
      (c.address && c.address.toLowerCase().includes(search)) ||
      c.mobile_number.includes(search)
    );
  }
  
  return contacts;    
});

  ngOnInit() {
    this.loadContacts();
    this.loadDepartments();
  }
  
  loadContacts() {
    this.contactService.getContacts().subscribe({
      next: (data) => this.allContacts.set(data),
      error: (err) => console.error(err)
    });
  }

  loadDepartments() {
    this.contactService.getDepartments().subscribe({
      next: (data) => this.allDepartments.set(data),
      error: (err) => console.error(err)
    });
  }

  copyToClipboard(value: string | undefined) {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      alert(`Copied / कॉपी केले: ${value}`);
    }).catch(err => console.error('Could not copy text: ', err));
  }

  onLogin() {
    this.contactService.login(this.loginData).subscribe({
      next: () => {
        this.showLoginModal.set(false);
        this.loginData = { username: '', password: '' };
        this.loadDepartments();
      },
      error: () => alert('Invalid credentials!')
    });
  }

  onAddDepartment() {
    const deptName = this.newDepartmentName().trim();
    if (!deptName) return alert('Enter a valid department name');

    this.contactService.saveDepartment({ name: deptName }).subscribe({
      next: (res) => {
        alert(res.message || 'Department Added successfully!');
        this.newDepartmentName.set('');
        this.loadDepartments();
      },
      error: (err) => {
        alert(err.error?.message || 'Error creating unique department parameter.');
      }
    });
  }

  deleteDepartment(id: number) {
  if (confirm('तुम्हाला खात्री आहे का की तुम्ही हे डिपार्टमेंट डिलीट करू इच्छिता?')) {
    this.contactService.deleteDepartment(id).subscribe({
      next: (res) => {
        alert(res.message);
        this.loadDepartments();
      },
      error: (err) => {
        alert(err.error?.error || 'डिपार्टमेंट डिलीट करता आले नाही!');
      }
    });
  }
}

onSaveContact() {
  const currentForm = this.contactForm();
  
  // व्हॅलिडेशन: नाव, मोबाईल आणि डिपार्टमेंट अनिवार्य आहेत
  if (!currentForm.name || !currentForm.mobile_number || !currentForm.department_name) {
    alert('Please fill all required fields (Name, Mobile, and Department)!');
    return;
  }

  // सर्व्हिस कॉल करून डेटा सेव्ह करणे
  this.contactService.saveContact(currentForm).subscribe({
    next: (res) => {
      alert(res.message || 'Contact saved successfully!');
      this.resetForm(); // फॉर्म रिसेट करणे
      this.loadContacts(); // टेबल डेटा रिफ्रेश करणे
    },
    error: (err) => {
      alert(err.error?.message || 'Error saving contact.');
    }
  });
}

  onEditContact(contact: Contact) {
    this.isEditing.set(true);
    this.contactForm.set({ ...contact });
  }

  onDeleteContact(id: number | undefined) {
    if (id && confirm('Are you sure you want to delete this contact?')) {
      this.contactService.deleteContact(id).subscribe(() => {
        this.loadContacts();
      });
    }
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
    }
  }

  exportData(format: 'excel' | 'csv') {
    const currentContacts = this.filteredContacts();
    
    const headers = [
      'Department', 'Designation', 'Address', 'Name', 'Mobile Number', 
      'Telephone Number','Email','Other Contact 1', 'Other Contact 2', 'Other Contact 3', 'Other Contact 4'
    ];
    
const rows = currentContacts.map(contact => [
  contact.department_name || '-',
  contact.designation || '-',
  contact.address || '-',
  contact.name || '-',
  contact.mobile_number ? `\t${contact.mobile_number}` : '', 
  contact.telephone_number ? `\t${contact.telephone_number}` : '-',
  contact.email || '-',
  contact.other_contact_1 ? `\t${contact.other_contact_1}` : '-',
  contact.other_contact_2 ? `\t${contact.other_contact_2}` : '-',
  contact.other_contact_3 ? `\t${contact.other_contact_3}` : '-',
  contact.other_contact_4 ? `\t${contact.other_contact_4}` : '-'
]);

    const worksheetData = [headers, ...rows];
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Contacts');

    const currentDate = new Date().toISOString().slice(0, 10);

    if (format === 'excel') {
      XLSX.writeFile(workbook, `contacts_directory_${currentDate}.xlsx`);
    } else {
      XLSX.writeFile(workbook, `contacts_directory_${currentDate}.csv`, { bookType: 'csv' });
    }
  }

  onUploadFile() {
    if (!this.selectedFile) {
      alert('Please select an Excel or CSV file first! / कृपया आधी फाईल निवडा!');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e: any) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (jsonData.length <= 1) {
        alert('The uploaded file is empty or missing data!');
        return;
      }

      const allowedDepartments = this.departmentsList(); 
      const validContactsToUpload: any[] = [];
      const errors: string[] = [];

      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.length === 0 || (!row[0] && !row[3])) continue; 

        const departmentName = row[0] ? String(row[0]).trim() : '';
        const designation = row[1] ? String(row[1]).trim() : '-';
        const address = row[2] ? String(row[2]).trim() : '-';
        const name = row[3] ? String(row[3]).trim() : '';
        const mobile = row[4] ? String(row[4]).trim() : '';
        const telephone = row[5] ? String(row[5]).trim() : '-';
        const email = row[6] ? String(row[6]).trim() : '-';
        const o1 = row[7] ? String(row[7]).trim() : '-';
        const o2 = row[8] ? String(row[8]).trim() : '-';
        const o3 = row[9] ? String(row[9]).trim() : '-';
        const o4 = row[10] ? String(row[10]).trim() : '-';

        if (!name || !mobile) {
          errors.push(`Row ${i + 1}: Name and Mobile Number are required.`);
          continue;
        }

        if (!allowedDepartments.includes(departmentName)) {
          errors.push(`Row ${i + 1}: Failed Constraint! Department '${departmentName}' does not exist.`);
          continue;
        }

        validContactsToUpload.push({          
          designation: designation,
          department_name: departmentName,
          address: address,
          name: name,
          mobile_number: mobile,
          telephone_number: telephone,
          email: email,
          other_contact_1: o1,
          other_contact_2: o2,
          other_contact_3: o3,
          other_contact_4: o4          
        });
      }

      if (errors.length > 0) {
        console.error('Import Errors:', errors);
        alert(`Import Failed due to Department Constraints!\n\n${errors.slice(0, 3).join('\n')}\n...and ${errors.length - 3} more errors.`);
        return;
      }

      if (validContactsToUpload.length > 0) {
        this.contactService.bulkImportContacts(validContactsToUpload).subscribe({
          next: () => {
            alert(`Success! ${validContactsToUpload.length} records imported successfully.`);
            this.loadContacts();
            this.selectedFile = null;
          },
          error: () => alert('Backend service error during bulk import.')
        });
      }
    };
    reader.readAsArrayBuffer(this.selectedFile);
  }  

  resetForm() {
    this.isEditing.set(false);
    this.contactForm.set({
      department_name: '', designation: '', name: '',  mobile_number: '', telephone_number: '',
      email: '',other_contact_1: '', other_contact_2: '', other_contact_3: '', other_contact_4: ''
    });
  }
}